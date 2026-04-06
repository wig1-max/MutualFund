// Goal Allocation Engine
// Recommends how a goal's target amount should be split across asset classes
// based on time horizon, client risk profile, and tax efficiency.

import { getDb } from '../db/index.js'

// Allocation buckets with expected returns and descriptions
const BUCKETS = {
  equity_mf:    { label: 'Equity Mutual Funds', expectedReturn: 12, riskLevel: 'high' },
  debt_mf:      { label: 'Debt Mutual Funds',   expectedReturn: 7,  riskLevel: 'low' },
  equity_stock: { label: 'Direct Stocks',        expectedReturn: 13, riskLevel: 'high' },
  fd:           { label: 'Fixed Deposits',        expectedReturn: 7,  riskLevel: 'low' },
  gold:         { label: 'Gold (SGB/Physical)',   expectedReturn: 8,  riskLevel: 'medium' },
  ppf:          { label: 'PPF',                   expectedReturn: 7.1, riskLevel: 'low' },
  nps:          { label: 'NPS',                   expectedReturn: 10, riskLevel: 'medium' },
  elss:         { label: 'ELSS (Tax Saving MF)',  expectedReturn: 12, riskLevel: 'high' },
}

/**
 * Compute recommended asset allocation for a goal.
 *
 * @param {Object} goal - { target_amount, target_year, monthly_sip, current_savings, expected_return, inflation_rate, goal_type }
 * @param {Object|null} profile - client_profiles row (risk scores, recommended equity/debt/gold %)
 * @param {Object} existingWealth - { mfValue, householdByBucket } summarizing current assets
 * @returns {Object} { allocations, totalMonthly, gapFromTarget, wealthProgress }
 */
export function computeGoalAllocation(goal, profile, existingWealth = {}) {
  const currentYear = new Date().getFullYear()
  const years = Math.max(0, goal.target_year - currentYear)
  const goalType = (goal.goal_type || 'Custom').toLowerCase()

  // Base split from risk profile or sensible defaults
  const effectiveScore = profile?.risk_effective_score ?? 50
  let baseEquity = profile?.recommended_equity_pct ?? 60
  let baseDebt   = profile?.recommended_debt_pct ?? 30
  let baseGold   = profile?.recommended_gold_pct ?? 10

  // Adjust based on time horizon
  const horizonAdjusted = adjustForHorizon(baseEquity, baseDebt, baseGold, years, effectiveScore)
  baseEquity = horizonAdjusted.equity
  baseDebt   = horizonAdjusted.debt
  baseGold   = horizonAdjusted.gold

  // Break down into specific buckets
  const bucketPcts = buildBucketAllocation(baseEquity, baseDebt, baseGold, years, goalType)

  // Compute inflation-adjusted target
  const inflRate = goal.inflation_rate ?? 6
  const inflatedTarget = goal.target_amount * Math.pow(1 + inflRate / 100, years)

  // Existing wealth contribution toward this goal
  const mfValue = existingWealth.mfValue || 0
  const householdValue = existingWealth.householdTotal || 0
  const totalExisting = mfValue + householdValue + (goal.current_savings || 0)
  const remainingTarget = Math.max(0, inflatedTarget - totalExisting)

  // Monthly investment needed
  const totalMonthly = goal.monthly_sip || 0
  const gapMonthly = computeRequiredMonthly(remainingTarget, goal.expected_return || 12, years) - totalMonthly

  // Build allocation array with amounts and rationale
  const allocations = []
  for (const [bucket, pct] of Object.entries(bucketPcts)) {
    if (pct <= 0) continue
    const info = BUCKETS[bucket]
    allocations.push({
      bucket,
      label: info?.label || bucket,
      percentage: Math.round(pct * 10) / 10,
      suggestedMonthly: Math.round(totalMonthly * pct / 100),
      expectedReturn: info?.expectedReturn || 10,
      rationale: getRationale(bucket, years, goalType),
    })
  }

  // Sort by percentage descending
  allocations.sort((a, b) => b.percentage - a.percentage)

  const wealthProgress = {
    mfValue: Math.round(mfValue),
    householdValue: Math.round(householdValue),
    currentSavings: Math.round(goal.current_savings || 0),
    totalExisting: Math.round(totalExisting),
    inflatedTarget: Math.round(inflatedTarget),
    progressPercent: inflatedTarget > 0 ? Math.round(totalExisting / inflatedTarget * 1000) / 10 : 0,
  }

  return {
    allocations,
    totalMonthly: Math.round(totalMonthly),
    gapFromTarget: Math.round(Math.max(0, gapMonthly)),
    yearsRemaining: years,
    inflatedTarget: Math.round(inflatedTarget),
    wealthProgress,
    riskScore: Math.round(effectiveScore),
  }
}

/**
 * Adjust base equity/debt/gold split based on goal time horizon.
 */
function adjustForHorizon(equity, debt, gold, years, riskScore) {
  if (years < 3) {
    // Short-term: cap equity at 30%, heavy debt
    equity = Math.min(equity, 30)
    debt = Math.max(debt, 55)
    gold = Math.max(gold, 5)
  } else if (years >= 3 && years <= 7) {
    // Medium-term: follow risk profile, slight debt tilt
    equity = Math.min(equity, equity) // no change, follow profile
    debt = Math.max(debt, 25)
  } else {
    // Long-term (> 7 years): boost equity 10-15% based on risk score
    const boost = riskScore >= 60 ? 15 : 10
    equity = Math.min(90, equity + boost)
    debt = Math.max(5, debt - boost * 0.6)
    gold = Math.max(5, gold - boost * 0.4)
  }

  // Normalize to 100%
  const total = equity + debt + gold
  if (total > 0 && Math.abs(total - 100) > 0.5) {
    const factor = 100 / total
    equity = equity * factor
    debt = debt * factor
    gold = gold * factor
  }

  return {
    equity: Math.round(equity * 10) / 10,
    debt:   Math.round(debt * 10) / 10,
    gold:   Math.round(gold * 10) / 10,
  }
}

/**
 * Break broad equity/debt/gold into specific investment buckets.
 */
function buildBucketAllocation(equity, debt, gold, years, goalType) {
  const alloc = {
    equity_mf: 0,
    debt_mf: 0,
    equity_stock: 0,
    fd: 0,
    gold: 0,
    ppf: 0,
    nps: 0,
    elss: 0,
  }

  // ---- Equity breakdown ----
  if (goalType === 'tax saving' || goalType === 'custom') {
    // Include ELSS for tax saving goals
    alloc.elss = Math.min(equity * 0.3, 20) // up to 30% of equity, max 20% overall
    alloc.equity_mf = equity - alloc.elss
  } else if (goalType === 'retirement' && years > 10) {
    // Long retirement: include some direct equity
    alloc.equity_stock = Math.min(equity * 0.15, 15)
    alloc.equity_mf = equity - alloc.equity_stock
  } else {
    alloc.equity_mf = equity
  }

  // ---- Debt breakdown ----
  if (years < 3) {
    // Short term: favor FD for stability
    alloc.fd = debt * 0.6
    alloc.debt_mf = debt * 0.4
  } else if (goalType === 'retirement' || goalType === 'tax saving') {
    // PPF for tax-free retirement/tax goals
    alloc.ppf = Math.min(debt * 0.4, 15)
    alloc.debt_mf = debt * 0.3
    alloc.fd = debt - alloc.ppf - alloc.debt_mf
  } else {
    alloc.debt_mf = debt * 0.6
    alloc.fd = debt * 0.4
  }

  // ---- Gold stays as gold ----
  alloc.gold = gold

  // ---- NPS for retirement goals with long horizon ----
  if (goalType === 'retirement' && years > 7) {
    // Carve out NPS from equity + debt
    alloc.nps = Math.min(15, alloc.equity_mf * 0.2 + alloc.debt_mf * 0.1)
    alloc.equity_mf = Math.max(0, alloc.equity_mf - alloc.nps * 0.6)
    alloc.debt_mf = Math.max(0, alloc.debt_mf - alloc.nps * 0.4)
  }

  // ---- ELSS for tax saving goals ----
  if (goalType === 'tax saving' && alloc.elss === 0) {
    alloc.elss = Math.min(20, alloc.equity_mf * 0.4)
    alloc.equity_mf = Math.max(0, alloc.equity_mf - alloc.elss)
  }

  // Clean up: round and remove zeros
  const result = {}
  for (const [k, v] of Object.entries(alloc)) {
    const rounded = Math.round(v * 10) / 10
    if (rounded > 0) result[k] = rounded
  }

  // Normalize to 100
  const total = Object.values(result).reduce((s, v) => s + v, 0)
  if (total > 0 && Math.abs(total - 100) > 0.5) {
    const factor = 100 / total
    for (const k in result) {
      result[k] = Math.round(result[k] * factor * 10) / 10
    }
  }

  return result
}

/**
 * Get human-readable rationale for each bucket.
 */
function getRationale(bucket, years, goalType) {
  const rationales = {
    equity_mf: years > 7
      ? 'Long horizon allows equity MFs to ride out volatility for higher returns'
      : years > 3
        ? 'Balanced allocation via diversified equity mutual funds'
        : 'Limited equity exposure for capital preservation',
    debt_mf: 'Stable returns with lower volatility than equity',
    equity_stock: 'Direct equity for potentially higher alpha over long term',
    fd: years < 3
      ? 'Capital protection for short-term goal'
      : 'Stable fixed-income component',
    gold: 'Portfolio diversifier and inflation hedge',
    ppf: goalType === 'retirement'
      ? 'Tax-free returns under Section 80C for retirement corpus'
      : 'Tax-efficient debt instrument under Section 80C',
    nps: 'Additional tax benefit under 80CCD(1B), retirement-focused',
    elss: 'Tax saving under Section 80C with equity growth potential (3-year lock-in)',
  }
  return rationales[bucket] || 'Diversification across asset classes'
}

/**
 * Required monthly SIP to reach a target amount.
 */
function computeRequiredMonthly(targetAmount, annualReturn, years) {
  if (years <= 0 || targetAmount <= 0) return 0
  const r = annualReturn / 100 / 12
  const n = years * 12
  if (r === 0) return targetAmount / n
  const sipFactor = (Math.pow(1 + r, n) - 1) / r * (1 + r)
  return targetAmount / sipFactor
}

/**
 * Fetch existing wealth summary for a client (MF + household assets).
 */
export function getClientWealthForGoals(clientId) {
  const db = getDb()

  // MF holdings value
  const mfRows = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN ch.units IS NOT NULL AND f.nav IS NOT NULL
        THEN ch.units * f.nav
        ELSE ch.invested_amount
      END
    ), 0) as total
    FROM client_holdings ch
    LEFT JOIN funds f ON ch.scheme_code = f.scheme_code
    WHERE ch.client_id = ?
  `).get(clientId)

  // CAS holdings value
  const casRows = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(current_value, cost_value, 0)), 0) as total
    FROM cas_holdings WHERE client_id = ?
  `).get(clientId)

  const mfValue = (mfRows?.total || 0) + (casRows?.total || 0)

  // Household assets by bucket
  const householdRows = db.prepare(`
    SELECT asset_type, COALESCE(SUM(COALESCE(current_value, invested_amount, 0)), 0) as total
    FROM household_assets WHERE client_id = ? GROUP BY asset_type
  `).all(clientId)

  let householdTotal = 0
  const householdByType = {}
  for (const row of householdRows) {
    householdByType[row.asset_type] = row.total
    householdTotal += row.total
  }

  return { mfValue, householdTotal, householdByType }
}
