import { getDb } from '../db/index.js'
import {
  getCategoryRiskLevel, riskLevelToScore, getAllocationBucket,
  isELSS, isEquityFund, isPassiveFund,
} from '../utils/fundClassification.js'
import { sortinoRatio, calmarRatio, jensensAlpha,
         fundAgeYears } from './calculations.js'
import { runGoalSurvival } from './monteCarloEngine.js'
import { fetchNavHistory } from './mfapi.js'

async function passesHardFilters(fund, metricsMap, db) {
  const m = metricsMap[fund.scheme_code]

  // Filter 1: Fund must exist in metrics or have NAV data
  if (!m) return true  // no metrics yet, pass through (scored as unknown)

  // Filter 2: Sharpe ratio minimum
  if (m.sharpe_ratio !== null && m.sharpe_ratio < 0.3) return false

  // Filter 3: Jensen's alpha floor — only eliminate clear underperformers
  if (m.jensen_alpha !== null && m.jensen_alpha < -4) return false

  // Filter 4: Max drawdown ceiling
  if (m.max_drawdown !== null && m.max_drawdown > 60) return false

  // Filter 5: AUM minimum from funds table
  // Skip this filter if aum not in funds table (add later when scraped)

  return true
}

function buildAllocationTargets(profile) {
  const equityPct = (profile.recommended_equity_pct || 60) / 100
  const debtPct   = (profile.recommended_debt_pct   || 30) / 100
  const goldPct   = (profile.recommended_gold_pct   || 10) / 100
  const taxSlab   = profile.tax_slab   || 20
  const horizon   = profile.investment_horizon || 10
  const riskScore = profile.risk_capacity_score || 50
  const elssInvested = profile.elss_invested_this_year || 0
  const elssHeadroom = Math.max(0, 150000 - elssInvested)

  const targets = []

  // ── EQUITY TARGETS ──────────────────────────────────────
  // These keywords must match AMFI scheme_category strings exactly.
  // AMFI format: "Equity Scheme - Large Cap Fund"
  // We match on the part after the dash.

  if (equityPct > 0) {
    // ELSS — only if meaningful tax benefit exists
    if (taxSlab >= 30 && elssHeadroom > 0) {
      targets.push({
        bucket: 'equity',
        amfi_keyword: 'ELSS',
        label: 'ELSS (Tax Saving)',
        weight: equityPct * 0.08,
        priority: 1,
      })
    }

    // Large Cap — always for equity
    targets.push({
      bucket: 'equity',
      amfi_keyword: 'Large Cap Fund',
      label: 'Large Cap',
      weight: equityPct * (horizon >= 7 ? 0.25 : 0.40),
      priority: 2,
    })

    // Flexi Cap — always for equity
    targets.push({
      bucket: 'equity',
      amfi_keyword: 'Flexi Cap Fund',
      label: 'Flexi Cap',
      weight: equityPct * 0.25,
      priority: 2,
    })

    // Mid Cap — moderate+ risk and 7+ year horizon
    if (riskScore >= 55 && horizon >= 7) {
      targets.push({
        bucket: 'equity',
        amfi_keyword: 'Mid Cap Fund',
        label: 'Mid Cap',
        weight: equityPct * 0.20,
        priority: 3,
      })
    }

    // Small Cap — aggressive only, 10+ year horizon
    if (riskScore >= 75 && horizon >= 10) {
      targets.push({
        bucket: 'equity',
        amfi_keyword: 'Small Cap Fund',
        label: 'Small Cap',
        weight: equityPct * 0.15,
        priority: 4,
      })
    }

    // Index Fund fallback — always include
    targets.push({
      bucket: 'equity',
      amfi_keyword: 'Index Funds',
      label: 'Index Fund',
      weight: equityPct * 0.10,
      priority: 3,
    })

    // Multi Cap — good diversifier
    targets.push({
      bucket: 'equity',
      amfi_keyword: 'Multi Cap Fund',
      label: 'Multi Cap',
      weight: equityPct * 0.10,
      priority: 3,
    })

    // Focused Fund — concentrated portfolio
    targets.push({
      bucket: 'equity',
      amfi_keyword: 'Focused Fund',
      label: 'Focused Fund',
      weight: equityPct * 0.08,
      priority: 3,
    })

    // Value Fund — contrarian style, moderate+ risk
    if (riskScore >= 55) {
      targets.push({
        bucket: 'equity',
        amfi_keyword: 'Value Fund',
        label: 'Value Fund',
        weight: equityPct * 0.08,
        priority: 3,
      })
    }
  }

  // ── DEBT TARGETS ─────────────────────────────────────────
  if (debtPct > 0) {
    if (horizon < 3) {
      // Short horizon — prioritise liquid and short duration
      targets.push({
        bucket: 'debt',
        amfi_keyword: 'Liquid Fund',
        label: 'Liquid Fund',
        weight: debtPct * 0.50,
        priority: 1,
      })
      targets.push({
        bucket: 'debt',
        amfi_keyword: 'Short Duration Fund',
        label: 'Short Duration',
        weight: debtPct * 0.50,
        priority: 1,
      })
    } else {
      // Medium/long horizon — corporate bond + banking PSU
      targets.push({
        bucket: 'debt',
        amfi_keyword: 'Corporate Bond Fund',
        label: 'Corporate Bond',
        weight: debtPct * 0.50,
        priority: 2,
      })
      targets.push({
        bucket: 'debt',
        amfi_keyword: 'Banking and PSU Fund',
        label: 'Banking & PSU Debt',
        weight: debtPct * 0.30,
        priority: 2,
      })
      targets.push({
        bucket: 'debt',
        amfi_keyword: 'Short Duration Fund',
        label: 'Short Duration',
        weight: debtPct * 0.20,
        priority: 3,
      })
    }
  }

  // ── GOLD TARGET ───────────────────────────────────────────
  if (goldPct > 0) {
    targets.push({
      bucket: 'gold',
      amfi_keyword: 'Gold',
      label: 'Gold Fund',
      weight: goldPct,
      priority: 3,
    })
  }

  return targets
}

function deduplicateByCategory(scored, limit) {
  // Track counts at two levels:
  // 1. Per allocation_bucket label (e.g. 'Large Cap', 'Mid Cap', 'ELSS')
  //    — max 1 for ELSS (only one fund needed for 80C)
  //    — max 2 for all other equity labels
  //    — max 1 for debt labels
  //    — max 1 for gold
  // 2. Per base fund identity (AMC + stripped name)

  const labelCounts = {}
  const seenBaseKeys = new Set()
  const result = []

  const MAX_PER_LABEL = {
    'ELSS (Tax Saving)': 1,
    'Large Cap': 2,
    'Flexi Cap': 2,
    'Multi Cap': 1,
    'Mid Cap': 2,
    'Small Cap': 2,
    'Index Fund': 1,
    'Focused Fund': 1,
    'Value Fund': 1,
    'Corporate Bond': 1,
    'Banking & PSU Debt': 1,
    'Short Duration': 1,
    'Liquid Fund': 1,
    'Gold Fund': 1,
    'Balanced Hybrid': 1,
    'Aggressive Hybrid': 1,
    'default': 1,
  }

  function getMaxForLabel(label) {
    return MAX_PER_LABEL[label] ?? MAX_PER_LABEL['default']
  }

  function getBaseKey(fund) {
    const name = (fund.scheme_name || '')
      .toLowerCase()
      .replace(/\s*[-\u2013]\s*(regular|growth|plan|option|series|annual|monthly|quarterly|weekly|fortnightly)\b.*/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    return `${(fund.amc || '').toLowerCase()}__${name}`
  }

  for (const fund of scored) {
    const label = fund.allocation_bucket || 'default'
    const baseKey = getBaseKey(fund)

    // Skip duplicate base funds
    if (seenBaseKeys.has(baseKey)) continue

    // Skip if this label is at its cap
    const currentCount = labelCounts[label] || 0
    if (currentCount >= getMaxForLabel(label)) continue

    seenBaseKeys.add(baseKey)
    labelCounts[label] = currentCount + 1
    result.push({ ...fund, rank: result.length + 1 })

    if (result.length >= limit) break
  }

  return result
}

function getBucketType(allocationBucket) {
  if (!allocationBucket) return 'other'
  const lower = allocationBucket.toLowerCase()
  if (lower.includes('debt') || lower.includes('corporate') ||
      lower.includes('banking') || lower.includes('short') ||
      lower.includes('duration') || lower.includes('psu') ||
      lower.includes('gilt')) return 'debt'
  if (lower.includes('liquid') || lower.includes('overnight') ||
      lower.includes('money market')) return 'liquid'
  if (lower.includes('gold')) return 'gold'
  if (lower.includes('hybrid') || lower.includes('balanced')) return 'hybrid'
  return 'equity'
}

function assignSipAmounts(recommendations, profile) {
  const surplus = profile.investable_surplus || 0
  if (surplus === 0 || recommendations.length === 0) {
    return recommendations.map(r => ({ ...r, recommended_sip: 500 }))
  }

  const equityPct = (profile.recommended_equity_pct || 60) / 100
  const debtPct = (profile.recommended_debt_pct || 30) / 100
  const goldPct = (profile.recommended_gold_pct || 10) / 100

  const bucketBudgets = {
    equity: surplus * equityPct,
    debt: surplus * debtPct,
    gold: surplus * goldPct,
    liquid: surplus * debtPct * 0.3,
    hybrid: surplus * 0.05,
    other: 0,
  }

  const bucketFundCounts = {}
  for (const r of recommendations) {
    const bucket = getBucketType(r.allocation_bucket)
    bucketFundCounts[bucket] = (bucketFundCounts[bucket] || 0) + 1
  }

  const withSips = recommendations.map(r => {
    const bucket = getBucketType(r.allocation_bucket)
    const fundsInBucket = bucketFundCounts[bucket] || 1
    const bucketBudget = bucketBudgets[bucket] || (surplus / recommendations.length)
    const rawSip = bucketBudget / fundsInBucket
    const roundedSip = Math.max(500, Math.round(rawSip / 500) * 500)
    return { ...r, recommended_sip: roundedSip }
  })

  // Final safety: if total exceeds surplus, scale each SIP down
  const totalSip = withSips.reduce((s, r) => s + r.recommended_sip, 0)
  if (totalSip > surplus * 1.05) {
    const scaleFactor = surplus / totalSip
    return withSips.map(r => ({
      ...r,
      recommended_sip: Math.max(
        500,
        Math.round((r.recommended_sip * scaleFactor) / 500) * 500
      )
    }))
  }

  return withSips
}

/**
 * Score and rank funds for a client based on their profile.
 * Writes results to fund_recommendations and returns a summary.
 */
export async function scoreClientFunds(clientId) {
  const db = getDb()

  // Load profile
  const profile = db.prepare('SELECT * FROM client_profiles WHERE client_id = ?').get(clientId)
  if (!profile) throw new Error('Client profile not found — complete the profiling questionnaire first')

  // Load existing holdings to detect overlap
  const existingHoldings = db.prepare('SELECT scheme_code FROM client_holdings WHERE client_id = ?').all(clientId)
  const heldCodes = new Set(existingHoldings.map(h => h.scheme_code))

  // Target allocation from profile
  const targetEquity = profile.recommended_equity_pct || 0
  const targetDebt = profile.recommended_debt_pct || 0
  const targetGold = profile.recommended_gold_pct || 0

  // Pull candidate funds — Regular Growth plans only (MFD-appropriate)
  const candidates = db.prepare(`
    SELECT scheme_code, scheme_name, scheme_category,
           amc, scheme_type, nav
    FROM funds
    WHERE scheme_category != ''
      AND scheme_category IS NOT NULL
      AND nav > 0
      AND LOWER(scheme_name) NOT LIKE '%direct%'
      AND LOWER(scheme_name) NOT LIKE '%idcw%'
      AND LOWER(scheme_name) NOT LIKE '%dividend%'
      AND LOWER(scheme_name) NOT LIKE '%bonus%'
      AND LOWER(scheme_name) NOT LIKE '%retail plan%'
      AND LOWER(scheme_name) NOT LIKE '%institutional%'
      AND LOWER(scheme_name) NOT LIKE '%segregated%'
      AND LOWER(scheme_name) NOT LIKE '%fof%'
      AND LOWER(scheme_name) NOT LIKE '%fund of fund%'
      AND LOWER(scheme_category) NOT LIKE '%arbitrage%'
      AND LOWER(scheme_category) NOT LIKE '%fof overseas%'
      AND LOWER(scheme_category) NOT LIKE '%fof domestic%'
      AND (
        LOWER(scheme_name) LIKE '%regular%'
        OR LOWER(scheme_name) LIKE '%growth%'
        OR (
          LOWER(scheme_name) NOT LIKE '%regular%'
          AND LOWER(scheme_name) NOT LIKE '%direct%'
        )
      )
    ORDER BY scheme_name
  `).all()

  if (candidates.length === 0) {
    throw new Error('No funds in database — run AMFI sync first')
  }

  // Pre-load fund_metrics for quality scoring
  const allMetrics = {}
  const metricsRows = db.prepare('SELECT * FROM fund_metrics').all()
  for (const m of metricsRows) allMetrics[m.scheme_code] = m

  // Build allocation targets for category fit scoring
  const allocationTargets = buildAllocationTargets(profile)

  const scored = candidates.map(fund => {
    const category = fund.scheme_category || ''
    const bucket = getAllocationBucket(category)
    const riskLevel = getCategoryRiskLevel(category)
    const fundRiskScore = riskLevelToScore(riskLevel)
    const reasons = []

    // 1. Category Fit (/25) — match against allocation targets
    let categoryFit = 0
    const categoryLower = category.toLowerCase()
    const matchingTarget = allocationTargets.find(t => {
      const keyword = t.amfi_keyword.toLowerCase()
      return categoryLower.includes(keyword) || keyword.includes(categoryLower.split(' ')[0].toLowerCase())
    })
    if (matchingTarget) {
      categoryFit = Math.round(25 * matchingTarget.weight * (1 / Math.max(matchingTarget.priority, 1)))
      categoryFit = Math.min(25, Math.max(5, categoryFit))
      reasons.push(`Fits ${matchingTarget.label} allocation target`)
    } else if (bucket === 'hybrid') { categoryFit = 10; reasons.push('Hybrid fund for balanced exposure') }
    else if (bucket === 'international') { categoryFit = 8; reasons.push('International diversification') }
    else { categoryFit = 3 }

    // 2. Risk Alignment (/25) — closer to profile score = better
    const riskDiff = Math.abs(fundRiskScore - (profile.risk_capacity_score || 50))
    let riskAlignment = Math.max(0, 25 - riskDiff * 0.3)
    riskAlignment = Math.round(riskAlignment * 100) / 100
    if (riskDiff < 15) reasons.push('Well-aligned with risk capacity')

    // 3. Tax Efficiency (/20)
    let taxEfficiency = 10 // baseline
    const taxSlab = parseInt(profile.tax_slab) || 30
    if (isELSS(category)) {
      const elssHeadroom = 150000 - (profile.elss_invested_this_year || 0)
      if (elssHeadroom > 0) { taxEfficiency = 20; reasons.push(`ELSS: ₹${Math.round(elssHeadroom).toLocaleString('en-IN')} 80C headroom`) }
      else { taxEfficiency = 12 }
    } else if (isEquityFund(category) && taxSlab >= 20) {
      taxEfficiency = 15 // equity taxed at lower rates than slab
      reasons.push('Equity tax advantage vs debt at your slab')
    } else if (!isEquityFund(category) && taxSlab <= 10) {
      taxEfficiency = 15 // low slab means debt tax isn't punishing
    }

    // 4. Overlap Penalty (/20 — start at 20, deduct if held)
    let overlapPenalty = 20
    if (heldCodes.has(fund.scheme_code)) {
      overlapPenalty = 0
      reasons.push('Already held — excluded from new SIP')
    }

    // 5. Quality Score (/10) — from pre-computed metrics
    let qualityScore = 5  // default for no metrics
    const qualityReasons = []
    const metrics = allMetrics[fund.scheme_code]

    if (metrics) {
      let rawScore = 0
      let components = 0

      // Sortino component (0-4 points) — primary quality signal
      if (metrics.sortino_ratio !== null && metrics.sortino_ratio !== undefined) {
        const sortino = metrics.sortino_ratio
        if (sortino > 2) { rawScore += 4; qualityReasons.push('Excellent downside protection (Sortino > 2)') }
        else if (sortino > 1) { rawScore += 3; qualityReasons.push('Good risk-adjusted returns (Sortino > 1)') }
        else if (sortino > 0.5) { rawScore += 2 }
        else if (sortino > 0) { rawScore += 1 }
        else { rawScore += 0; qualityReasons.push('Poor downside protection') }
        components++
      }

      // Calmar component (0-3 points) — crash recovery signal
      if (metrics.calmar_ratio !== null && metrics.calmar_ratio !== undefined) {
        const calmar = metrics.calmar_ratio
        if (calmar > 1.5) { rawScore += 3; qualityReasons.push('Strong crash recovery (Calmar > 1.5)') }
        else if (calmar > 0.8) { rawScore += 2 }
        else if (calmar > 0.4) { rawScore += 1 }
        else { rawScore += 0; qualityReasons.push('High drawdown relative to returns') }
        components++
      }

      // Jensen Alpha component (0-3 points) — manager skill signal
      if (metrics.jensen_alpha !== null && metrics.jensen_alpha !== undefined) {
        const alpha = metrics.jensen_alpha
        if (alpha > 3) { rawScore += 3; qualityReasons.push(`Manager adds ${alpha.toFixed(1)}% alpha vs benchmark`) }
        else if (alpha > 1) { rawScore += 2 }
        else if (alpha > 0) { rawScore += 1 }
        else if (alpha < -2) { rawScore -= 1; qualityReasons.push('Fund underperforms benchmark after risk adjustment') }
        components++
      }

      // Peer outperformance (0-2 points)
      if (metrics.return_3y !== null && metrics.category_avg_3y !== null) {
        const outperformance = metrics.return_3y - metrics.category_avg_3y
        if (outperformance > 3) { rawScore += 2; qualityReasons.push(`Outperforms peers by ${outperformance.toFixed(1)}% (3Y)`) }
        else if (outperformance > 1) { rawScore += 1 }
        else if (outperformance < -3) { rawScore -= 1 }
        components++
      }

      qualityScore = components > 0 ? Math.min(10, Math.max(0, rawScore)) : 5
    }

    // Add quality reasons to main reasons array
    reasons.push(...qualityReasons)

    const compositeScore = Math.round((categoryFit + riskAlignment + taxEfficiency + overlapPenalty + qualityScore) * 100) / 100

    return {
      scheme_code: fund.scheme_code,
      scheme_name: fund.scheme_name,
      category,
      amc: fund.amc || '',
      composite_score: compositeScore,
      category_fit_score: categoryFit,
      risk_alignment_score: riskAlignment,
      tax_efficiency_score: taxEfficiency,
      overlap_penalty: overlapPenalty,
      quality_score: qualityScore,
      recommended_sip: 0,  // assigned after deduplication
      reasons,
      allocation_bucket: bucket,
    }
  })

  // Sort by composite score desc, deduplicate, and assign SIP amounts
  scored.sort((a, b) => b.composite_score - a.composite_score)

  // Debug: show top 15 scoring funds before deduplication
  console.log('\n=== TOP 15 SCORED FUNDS (pre-dedup) ===')
  scored.slice(0, 15).forEach((f, i) => {
    console.log(
      `${i+1}. [${f.composite_score}] ${(f.scheme_name||'').substring(0,45).padEnd(45)} | ${(f.scheme_category||'').substring(0,30).padEnd(30)} | bucket: ${f.allocation_bucket}`
    )
  })
  console.log('=== END DEBUG ===\n')

  const ranked = deduplicateByCategory(scored, 10)

  // BUG FIX 5: Minimum fund count guardrail
  if (ranked.length < 5) {
    console.warn(`[ScoringEngine] Only ${ranked.length} funds passed filters for client ${clientId}. Consider running AMFI sync or relaxing hard filters.`)
  }

  const top = assignSipAmounts(ranked, profile)

  // Persist
  const now = new Date().toISOString()
  const insertRecs = db.transaction((recs) => {
    db.prepare('DELETE FROM fund_recommendations WHERE client_id = ?').run(clientId)
    const stmt = db.prepare(`
      INSERT INTO fund_recommendations (
        client_id, scheme_code, scheme_name, category, amc,
        composite_score, category_fit_score, risk_alignment_score,
        tax_efficiency_score, overlap_penalty, quality_score,
        recommended_sip, rank, reasons, allocation_bucket, generated_at
      ) VALUES (
        @client_id, @scheme_code, @scheme_name, @category, @amc,
        @composite_score, @category_fit_score, @risk_alignment_score,
        @tax_efficiency_score, @overlap_penalty, @quality_score,
        @recommended_sip, @rank, @reasons, @allocation_bucket, @generated_at
      )
    `)
    recs.forEach((rec, i) => {
      stmt.run({
        client_id: clientId,
        ...rec,
        rank: i + 1,
        reasons: JSON.stringify(rec.reasons),
        generated_at: now,
      })
    })
  })

  insertRecs(top)

  // Run Monte Carlo for top recommendation as portfolio proxy
  let survivalAnalysis = null
  try {
    if (top.length > 0) {
      const avgReturn = top.slice(0, 5)
        .reduce((sum, r) => sum + (allMetrics[r.scheme_code]?.return_3y || 10), 0) /
        Math.min(5, top.length)

      survivalAnalysis = runGoalSurvival({
        monthlyInvestment: profile.investable_surplus || 0,
        currentSavings: profile.existing_pf_balance || 0,
        targetAmount: 10000000,  // fallback ₹1 Cr if no goal set
        horizonYears: profile.investment_horizon || 10,
        portfolioMeanReturn: (avgReturn / 100),
        portfolioStdDev: 0.15,  // conservative default
        inflationRate: 0.06,
        numSimulations: 1000,
        stressScenarios: true,
      })
    }
  } catch (e) {
    console.warn('Monte Carlo failed, skipping:', e.message)
  }

  return {
    client_id: clientId,
    recommendations_count: top.length,
    survival_analysis: survivalAnalysis,
    generated_at: now,
  }
}

/**
 * Store pre-computed NAV-derived metrics for a fund.
 */
export function storeFundMetrics(metrics) {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO fund_metrics (
      scheme_code, std_deviation, max_drawdown, sharpe_ratio,
      sortino_ratio, calmar_ratio, jensen_alpha,
      return_1y, return_3y, return_5y, risk_level,
      metrics_date, computed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,date('now'),datetime('now'))
  `).run(
    metrics.scheme_code,
    metrics.standardDeviation ?? metrics.std_deviation ?? null,
    metrics.maxDrawdown ?? metrics.max_drawdown ?? null,
    metrics.sharpeRatio ?? metrics.sharpe_ratio ?? null,
    metrics.sortinoRatio ?? metrics.sortino_ratio ?? null,
    metrics.calmarRatio ?? metrics.calmar_ratio ?? null,
    metrics.jensenAlpha ?? metrics.jensen_alpha ?? null,
    metrics.return1y ?? metrics.return_1y ?? null,
    metrics.return3y ?? metrics.return_3y ?? null,
    metrics.return5y ?? metrics.return_5y ?? null,
    metrics.riskLevel ?? metrics.risk_level ?? null,
  )
}
