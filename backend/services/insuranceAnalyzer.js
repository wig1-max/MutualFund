// Insurance coverage analyzer.
//
// Reads the client's insurance policies from `household_assets` (where
// asset_type = 'insurance') and compares the aggregate life cover against
// the 10x-annual-income rule of thumb. Health cover is surfaced separately
// (no coverage ratio — presence is what matters).
//
// Insurance-specific fields live in the `metadata` JSON column:
//   {
//     sum_assured:      number,  // coverage payout
//     annual_premium:   number,  // premium per year (₹)
//     premium_frequency:'Monthly'|'Quarterly'|'Half-yearly'|'Annual'|'One-time',
//     policy_term_years:number,
//     insurer:          string,
//     policy_number:    string
//   }
//
// Fallbacks: if `sum_assured` is missing, `current_value` is used.

import { getDb } from '../db/index.js'

const LIFE_SUBTYPES   = new Set(['Term', 'Endowment', 'ULIP', 'Money Back', 'Whole Life'])
const HEALTH_SUBTYPES = new Set(['Health'])

export const TARGET_LIFE_COVER_MULTIPLE = 10 // industry rule of thumb

function parseMeta(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

// Convert a premium of any frequency to an annualised number.
function annualisePremium(amount, frequency) {
  const n = Number(amount) || 0
  if (!n) return 0
  switch ((frequency || '').toLowerCase()) {
    case 'monthly':     return n * 12
    case 'quarterly':   return n * 4
    case 'half-yearly':
    case 'halfyearly':  return n * 2
    case 'one-time':    return 0 // single-premium contributes 0 annual outflow
    case 'annual':
    case 'yearly':
    default:            return n
  }
}

/**
 * Analyse a client's insurance coverage.
 * @param {number} clientId
 * @param {number} monthlyIncome - client's monthly income (from client_profiles)
 * @returns {object} coverage ratios, gaps, status, per-policy breakdown
 */
export function analyzeInsurance(clientId, monthlyIncome) {
  const db = getDb()
  const rows = db.prepare(
    "SELECT * FROM household_assets WHERE client_id = ? AND asset_type = 'insurance'"
  ).all(clientId)

  let totalLifeCover    = 0
  let totalHealthCover  = 0
  let totalAnnualPremium = 0
  const policies = []

  for (const row of rows) {
    const meta       = parseMeta(row.metadata)
    const sumAssured = Number(meta.sum_assured ?? row.current_value ?? 0) || 0
    const annualPrem = annualisePremium(meta.annual_premium, meta.premium_frequency)
    const subtype    = row.asset_subtype || ''
    const isLife     = LIFE_SUBTYPES.has(subtype)
    const isHealth   = HEALTH_SUBTYPES.has(subtype)

    if (isLife)   totalLifeCover   += sumAssured
    if (isHealth) totalHealthCover += sumAssured
    totalAnnualPremium += annualPrem

    policies.push({
      id:             row.id,
      name:           row.name,
      subtype,
      category:       isLife ? 'life' : isHealth ? 'health' : 'other',
      sum_assured:    sumAssured,
      annual_premium: annualPrem,
      insurer:        meta.insurer || null,
      maturity_date:  row.maturity_date,
    })
  }

  const annualIncome    = (Number(monthlyIncome) || 0) * 12
  const targetLifeCover = annualIncome * TARGET_LIFE_COVER_MULTIPLE
  const lifeCoverGap    = Math.max(0, targetLifeCover - totalLifeCover)
  const lifeCoverRatio  = annualIncome > 0 ? totalLifeCover / annualIncome : 0

  // Classification used by the UI banner.
  //   unknown  — no income on file, can't evaluate
  //   missing  — no life policy at all
  //   under    — less than 5x annual income
  //   low      — between 5x and 10x
  //   adequate — 10x or more
  let lifeCoverStatus
  if (annualIncome === 0) lifeCoverStatus = 'unknown'
  else if (totalLifeCover === 0) lifeCoverStatus = 'missing'
  else if (lifeCoverRatio < 5)   lifeCoverStatus = 'under'
  else if (lifeCoverRatio < TARGET_LIFE_COVER_MULTIPLE) lifeCoverStatus = 'low'
  else lifeCoverStatus = 'adequate'

  // Health is a simpler binary: either the client has some cover or not.
  const healthCoverStatus = totalHealthCover > 0 ? 'covered' : 'missing'

  return {
    annual_income:         annualIncome,
    target_life_cover:     targetLifeCover,
    total_life_cover:      totalLifeCover,
    total_health_cover:    totalHealthCover,
    life_cover_gap:        lifeCoverGap,
    life_cover_ratio:      Math.round(lifeCoverRatio * 100) / 100,
    life_cover_status:     lifeCoverStatus,
    health_cover_status:   healthCoverStatus,
    total_annual_premium:  totalAnnualPremium,
    policies,
    policy_count:          policies.length,
    target_life_multiple:  TARGET_LIFE_COVER_MULTIPLE,
  }
}
