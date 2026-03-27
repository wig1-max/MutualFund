import { getDb } from '../db/index.js'
import {
  getCategoryRiskLevel, riskLevelToScore, getAllocationBucket,
  isELSS, isEquityFund, isPassiveFund,
} from '../utils/fundClassification.js'

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

  // Pull candidate funds — grab a broad set, we'll score and filter
  const candidates = db.prepare(
    'SELECT scheme_code, scheme_name, scheme_category, amc, nav FROM funds WHERE nav IS NOT NULL AND scheme_name IS NOT NULL LIMIT 500'
  ).all()

  if (candidates.length === 0) {
    throw new Error('No funds in database — run AMFI sync first')
  }

  // Pre-load fund_metrics for quality scoring
  const allMetrics = {}
  const metricsRows = db.prepare('SELECT * FROM fund_metrics').all()
  for (const m of metricsRows) allMetrics[m.scheme_code] = m

  const scored = candidates.map(fund => {
    const category = fund.scheme_category || ''
    const bucket = getAllocationBucket(category)
    const riskLevel = getCategoryRiskLevel(category)
    const fundRiskScore = riskLevelToScore(riskLevel)
    const reasons = []

    // 1. Category Fit (/25) — how well does this bucket match the recommended allocation
    let categoryFit = 0
    if (bucket === 'equity' && targetEquity >= 60) { categoryFit = 25; reasons.push('Strong equity fit for growth profile') }
    else if (bucket === 'equity' && targetEquity >= 40) { categoryFit = 20; reasons.push('Good equity allocation match') }
    else if (bucket === 'equity' && targetEquity > 0) { categoryFit = 10 }
    else if (bucket === 'debt' && targetDebt >= 50) { categoryFit = 25; reasons.push('Strong debt fit for conservative profile') }
    else if (bucket === 'debt' && targetDebt >= 30) { categoryFit = 20; reasons.push('Good debt allocation match') }
    else if (bucket === 'debt' && targetDebt > 0) { categoryFit = 10 }
    else if (bucket === 'gold' && targetGold >= 10) { categoryFit = 20; reasons.push('Gold allocation for diversification') }
    else if (bucket === 'hybrid') { categoryFit = 15; reasons.push('Hybrid fund for balanced exposure') }
    else if (bucket === 'international') { categoryFit = 12; reasons.push('International diversification') }
    else if (bucket === 'liquid') { categoryFit = 8 }
    else { categoryFit = 5 }

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
    let qualityScore = 5 // default when no metrics
    const metrics = allMetrics[fund.scheme_code]
    if (metrics) {
      qualityScore = 0
      if (metrics.sharpe_ratio > 1) qualityScore += 4
      else if (metrics.sharpe_ratio > 0.5) qualityScore += 2
      if (metrics.max_drawdown < 0.15) qualityScore += 3
      else if (metrics.max_drawdown < 0.25) qualityScore += 1.5
      if (metrics.return_3y > 12) qualityScore += 3
      else if (metrics.return_3y > 8) qualityScore += 1.5
      qualityScore = Math.min(10, qualityScore)
      if (qualityScore >= 7) reasons.push('Strong risk-adjusted returns')
    }

    const compositeScore = Math.round((categoryFit + riskAlignment + taxEfficiency + overlapPenalty + qualityScore) * 100) / 100

    // Recommended SIP — proportional to surplus and allocation weight
    const surplus = profile.investable_surplus || 0
    let sipWeight = 0
    if (bucket === 'equity') sipWeight = targetEquity / 100
    else if (bucket === 'debt') sipWeight = targetDebt / 100
    else if (bucket === 'gold') sipWeight = targetGold / 100
    else sipWeight = 0.1
    // Distribute across ~5 funds per bucket, so divide by 5
    const recommendedSip = Math.round(surplus * sipWeight / 5 / 100) * 100 // round to nearest 100

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
      recommended_sip: recommendedSip,
      reasons,
      allocation_bucket: bucket,
    }
  })

  // Sort by composite score desc, take top 10
  scored.sort((a, b) => b.composite_score - a.composite_score)
  const top = scored.slice(0, 10)

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

  return {
    client_id: clientId,
    recommendations_count: top.length,
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
      return_1y, return_3y, return_5y,
      category_avg_1y, category_avg_3y,
      risk_level, metrics_date, computed_at
    ) VALUES (
      @scheme_code, @std_deviation, @max_drawdown, @sharpe_ratio,
      @return_1y, @return_3y, @return_5y,
      @category_avg_1y, @category_avg_3y,
      @risk_level, @metrics_date, datetime('now')
    )
  `).run({
    scheme_code: metrics.scheme_code,
    std_deviation: metrics.std_deviation ?? null,
    max_drawdown: metrics.max_drawdown ?? null,
    sharpe_ratio: metrics.sharpe_ratio ?? null,
    return_1y: metrics.return_1y ?? null,
    return_3y: metrics.return_3y ?? null,
    return_5y: metrics.return_5y ?? null,
    category_avg_1y: metrics.category_avg_1y ?? null,
    category_avg_3y: metrics.category_avg_3y ?? null,
    risk_level: metrics.risk_level ?? null,
    metrics_date: metrics.metrics_date ?? null,
  })
}
