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

// ── SLOT-BASED SELECTION ENGINE ────────────────────────────

function buildSlots(profile) {
  const riskScore = profile.risk_capacity_score || 50
  const horizon   = profile.investment_horizon || 10
  const taxSlab   = profile.tax_slab || 20
  const elssInvested = profile.elss_invested_this_year || 0
  const elssHeadroom = Math.max(0, 150000 - elssInvested)
  const eq = profile.recommended_equity_pct || 60
  const de = profile.recommended_debt_pct   || 30
  const go = profile.recommended_gold_pct   || 10

  const slots = []

  // ── EQUITY SLOTS ──────────────────────────────────────

  // Large Cap — always for any equity allocation
  if (eq > 0) {
    slots.push({
      id: 'large_cap_1',
      label: 'Large Cap',
      amfi_category_contains: 'Large Cap Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: eq * 0.28,
      required: true,
    })
  }

  // Flexi Cap — good for all profiles
  if (eq > 0) {
    slots.push({
      id: 'flexi_cap_1',
      label: 'Flexi Cap',
      amfi_category_contains: 'Flexi Cap Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: eq * 0.28,
      required: true,
    })
  }

  // Mid Cap — moderate+ risk, 7+ year horizon
  if (eq > 0 && riskScore >= 55 && horizon >= 7) {
    slots.push({
      id: 'mid_cap_1',
      label: 'Mid Cap',
      amfi_category_contains: 'Mid Cap Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: eq * 0.20,
      required: false,
    })
  }

  // Small Cap — aggressive, 10+ year horizon
  if (eq > 0 && riskScore >= 75 && horizon >= 10) {
    slots.push({
      id: 'small_cap_1',
      label: 'Small Cap',
      amfi_category_contains: 'Small Cap Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: eq * 0.15,
      required: false,
    })
  }

  // ELSS — only if meaningful tax saving
  if (eq > 0 && taxSlab >= 20 && elssHeadroom > 0) {
    slots.push({
      id: 'elss_1',
      label: 'ELSS (Tax Saving)',
      amfi_category_contains: 'ELSS',
      scheme_type: 'Open Ended Schemes',
      sip_weight: eq * 0.09,
      required: false,
      reason: `ELSS saves \u20B9${Math.round(elssHeadroom * taxSlab / 100).toLocaleString('en-IN')} in taxes this year`
    })
  }

  // ── DEBT SLOTS ────────────────────────────────────────

  if (de > 0 && horizon >= 3) {
    slots.push({
      id: 'corp_bond_1',
      label: 'Corporate Bond',
      amfi_category_contains: 'Corporate Bond Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: de * 0.55,
      required: false,
    })
    slots.push({
      id: 'banking_psu_1',
      label: 'Banking & PSU Debt',
      amfi_category_contains: 'Banking and PSU Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: de * 0.45,
      required: false,
    })
  }

  if (de > 0 && horizon < 3) {
    slots.push({
      id: 'short_dur_1',
      label: 'Short Duration',
      amfi_category_contains: 'Short Duration Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: de * 0.60,
      required: false,
    })
    slots.push({
      id: 'liquid_1',
      label: 'Liquid Fund',
      amfi_category_contains: 'Liquid Fund',
      scheme_type: 'Open Ended Schemes',
      sip_weight: de * 0.40,
      required: false,
    })
  }

  // ── GOLD SLOT ─────────────────────────────────────────

  if (go > 0) {
    slots.push({
      id: 'gold_1',
      label: 'Gold Fund',
      amfi_category_contains: 'Gold',
      scheme_type: 'Open Ended Schemes',
      sip_weight: go * 1.0,
      required: false,
    })
  }

  // Normalise sip_weights to sum to 1
  const totalWeight = slots.reduce((s, sl) => s + sl.sip_weight, 0)
  return slots.map(sl => ({
    ...sl,
    sip_weight: parseFloat((sl.sip_weight / totalWeight).toFixed(6))
  }))
}

function findBestFundForSlot(slot, db, metricsMap, existingHoldingCodes) {
  // Get all candidate funds matching this slot's category
  const candidates = db.prepare(`
    SELECT f.scheme_code, f.scheme_name, f.scheme_category,
           f.amc, f.nav, f.scheme_type
    FROM funds f
    WHERE LOWER(f.scheme_category) LIKE ?
      AND f.nav > 0
      AND LOWER(f.scheme_name) NOT LIKE '%direct%'
      AND LOWER(f.scheme_name) NOT LIKE '%idcw%'
      AND LOWER(f.scheme_name) NOT LIKE '%dividend%'
      AND LOWER(f.scheme_name) NOT LIKE '%bonus%'
      AND LOWER(f.scheme_name) NOT LIKE '%segregated%'
      AND LOWER(f.scheme_name) NOT LIKE '%fof%'
      AND LOWER(f.scheme_category) NOT LIKE '%arbitrage%'
      AND LOWER(f.scheme_category) NOT LIKE '%fof overseas%'
    ORDER BY f.scheme_name ASC
  `).all(`%${slot.amfi_category_contains.toLowerCase()}%`)

  if (candidates.length === 0) return null

  // Score each candidate within its slot
  const scored = candidates.map(fund => {
    const m = metricsMap[fund.scheme_code]
    const alreadyHeld = existingHoldingCodes.has(fund.scheme_code)

    // If fund already held by client, deprioritise heavily
    const heldPenalty = alreadyHeld ? -1000 : 0

    // Primary: sortino ratio (null = 0, treated as unknown)
    const sortino = m?.sortino_ratio ?? 0

    // Secondary: calmar ratio
    const calmar = m?.calmar_ratio ?? 0

    // Tertiary: outperformance vs category average
    const return3y = m?.return_3y ?? 0
    const categoryAvg3y = m?.category_avg_3y ?? 0
    const outperformance = return3y - categoryAvg3y

    // Quality proxy: data points in nav_cache
    const dataPoints = m?.nav_data_points ?? 0
    const ageScore = Math.min(100, dataPoints / 25)

    // Composite within-slot score
    // Weights: sortino 40%, calmar 30%, outperformance 20%, age 10%
    const inSlotScore = (
      (sortino   * 40) +
      (calmar    * 30) +
      (outperformance * 2) +
      (ageScore  * 0.10)
    ) + heldPenalty

    const reasons = []
    if (slot.reason) reasons.push(slot.reason)
    if (m?.sortino_ratio != null && m.sortino_ratio > 1) {
      reasons.push(
        `Strong downside protection (Sortino: ${m.sortino_ratio.toFixed(2)})`
      )
    }
    if (outperformance > 2) {
      reasons.push(
        `Beats category average by ${outperformance.toFixed(1)}% (3Y)`
      )
    }
    if (m?.calmar_ratio != null && m.calmar_ratio > 1) {
      reasons.push(
        `Good crash recovery profile (Calmar: ${m.calmar_ratio.toFixed(2)})`
      )
    }
    if (reasons.length === 0) {
      reasons.push(`Best available ${slot.label} by risk-adjusted ranking`)
    }

    return {
      ...fund,
      in_slot_score: inSlotScore,
      sortino_ratio: m?.sortino_ratio ?? null,
      calmar_ratio: m?.calmar_ratio ?? null,
      sharpe_ratio: m?.sharpe_ratio ?? null,
      jensen_alpha: m?.jensen_alpha ?? null,
      return_3y: return3y,
      category_avg_3y: categoryAvg3y,
      data_quality_score: m?.data_quality_score ?? 0,
      nav_data_points: dataPoints,
      allocation_bucket: slot.label,
      slot_id: slot.id,
      reasons,
      already_held: alreadyHeld,
    }
  })

  // Sort by in_slot_score descending
  scored.sort((a, b) => b.in_slot_score - a.in_slot_score)

  // Return best fund
  return scored[0] || null
}

function persistRecommendations(db, clientId, recommendations) {
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
    recs.forEach((rec) => {
      stmt.run({
        client_id: clientId,
        scheme_code: rec.scheme_code,
        scheme_name: rec.scheme_name,
        category: rec.category,
        amc: rec.amc,
        composite_score: rec.composite_score,
        category_fit_score: 0,
        risk_alignment_score: 0,
        tax_efficiency_score: 0,
        overlap_penalty: 0,
        quality_score: 0,
        recommended_sip: rec.recommended_sip,
        rank: rec.rank,
        reasons: JSON.stringify(rec.reasons),
        allocation_bucket: rec.allocation_bucket,
        generated_at: now,
      })
    })
  })
  insertRecs(recommendations)
}

/**
 * Slot-based fund selection engine.
 * Builds slots from client profile, fills each with the best matching fund.
 */
export async function scoreClientFunds(clientId, options = {}) {
  const { limit = 10, persist = true } = options
  const db = getDb()

  // Load client profile
  const profile = db.prepare(
    'SELECT * FROM client_profiles WHERE client_id = ?'
  ).get(clientId)
  if (!profile) {
    throw new Error(
      'Client profile not found. Complete the profiling questionnaire first.'
    )
  }

  // Load existing holdings for overlap detection
  const casHoldings = db.prepare(
    'SELECT scheme_code FROM cas_holdings WHERE client_id = ?'
  ).all(clientId)
  const manualHoldings = db.prepare(
    'SELECT scheme_code FROM client_holdings WHERE client_id = ?'
  ).all(clientId)
  const existingHoldingCodes = new Set([
    ...casHoldings.map(h => h.scheme_code),
    ...manualHoldings.map(h => h.scheme_code),
  ].filter(Boolean))

  // Load all fund metrics into memory map
  const allMetrics = db.prepare('SELECT * FROM fund_metrics').all()
  const metricsMap = {}
  for (const m of allMetrics) metricsMap[m.scheme_code] = m

  // Log metrics coverage for debugging
  console.log(
    `[ScoringEngine] fund_metrics has ${allMetrics.length} funds. ` +
    `Client ${clientId} has ${existingHoldingCodes.size} existing holdings.`
  )

  // Build slots for this client
  const slots = buildSlots(profile)
  console.log(
    `[ScoringEngine] ${slots.length} slots defined for profile: ` +
    `${profile.risk_label}`
  )

  // Fill each slot with the best matching fund
  const recommendations = []
  let rank = 1
  const surplus = profile.investable_surplus || 0

  for (const slot of slots) {
    const best = findBestFundForSlot(
      slot, db, metricsMap, existingHoldingCodes
    )

    if (!best) {
      console.warn(
        `[ScoringEngine] No fund found for slot: ${slot.id} ` +
        `(category: ${slot.amfi_category_contains})`
      )
      continue
    }

    // Calculate composite score for display (0-100)
    const hasMetrics = best.nav_data_points > 0
    const sortinoPts = hasMetrics
      ? Math.min(30, (best.sortino_ratio || 0) * 15) : 15
    const calmarPts  = hasMetrics
      ? Math.min(20, (best.calmar_ratio  || 0) * 10) : 10
    const qualityPts = Math.min(20, best.data_quality_score * 0.2)
    const outPts     = Math.min(15,
      Math.max(0, (best.return_3y - best.category_avg_3y) * 2)
    )
    const basePts    = 15
    const displayScore = Math.round(
      basePts + sortinoPts + calmarPts + qualityPts + outPts
    )

    // SIP amount for this slot
    const rawSip  = surplus * slot.sip_weight
    const sip     = Math.max(500, Math.round(rawSip / 500) * 500)

    recommendations.push({
      rank,
      scheme_code:     best.scheme_code,
      scheme_name:     best.scheme_name,
      scheme_category: best.scheme_category,
      category:        best.scheme_category,
      amc:             best.amc,
      composite_score: displayScore,
      allocation_bucket: slot.label,
      recommended_sip: sip,
      reasons:         best.reasons,
      sortino_ratio:   best.sortino_ratio,
      calmar_ratio:    best.calmar_ratio,
      sharpe_ratio:    best.sharpe_ratio,
      jensen_alpha:    best.jensen_alpha,
      return_3y:       best.return_3y,
      category_avg_3y: best.category_avg_3y,
      data_quality_score: best.data_quality_score,
      nav_data_points: best.nav_data_points,
      already_held:    best.already_held,
      slot_id:         slot.id,
    })
    rank++
  }

  // Scale SIPs so total does not exceed surplus
  const totalSip = recommendations.reduce(
    (s, r) => s + r.recommended_sip, 0
  )
  if (surplus > 0 && totalSip > surplus) {
    const scale = surplus / totalSip
    for (const r of recommendations) {
      r.recommended_sip = Math.max(
        500,
        Math.round((r.recommended_sip * scale) / 500) * 500
      )
    }
  }

  // Run Monte Carlo
  let survivalAnalysis = null
  try {
    if (recommendations.length > 0 && surplus > 0) {
      const equityRecs = recommendations.filter(r =>
        ['Large Cap','Flexi Cap','Mid Cap',
         'Small Cap','ELSS (Tax Saving)','Multi Cap']
          .includes(r.allocation_bucket)
      )
      const avgReturn3y = equityRecs.length > 0
        ? equityRecs.reduce((s, r) => s + (r.return_3y || 11), 0) /
          equityRecs.length
        : 11

      survivalAnalysis = runGoalSurvival({
        monthlyInvestment: surplus,
        currentSavings: profile.existing_pf_balance || 0,
        targetAmount: 10000000,
        horizonYears: profile.investment_horizon || 10,
        portfolioMeanReturn: Math.min(0.20,
          Math.max(0.08, avgReturn3y / 100)),
        portfolioStdDev: 0.14,
        inflationRate: 0.06,
        numSimulations: 1000,
        stressScenarios: true,
      })
    }
  } catch (e) {
    console.warn('[ScoringEngine] Monte Carlo skipped:', e.message)
  }

  // Persist recommendations
  if (persist) {
    persistRecommendations(db, clientId, recommendations)
    db.prepare(
      "UPDATE client_profiles SET last_scored_at = datetime('now') WHERE client_id = ?"
    ).run(clientId)
  }

  return {
    profile: {
      risk_label: profile.risk_label,
      risk_capacity_score: profile.risk_capacity_score,
      investable_surplus: profile.investable_surplus,
      recommended_equity_pct: profile.recommended_equity_pct,
      recommended_debt_pct: profile.recommended_debt_pct,
      recommended_gold_pct: profile.recommended_gold_pct,
    },
    slots_defined: slots.length,
    slots_filled: recommendations.length,
    metrics_coverage: allMetrics.length,
    recommendations,
    total_recommended_sip: recommendations.reduce(
      (s, r) => s + r.recommended_sip, 0
    ),
    survival_analysis: survivalAnalysis,
    scored_at: new Date().toISOString(),
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
