// Basic current-value estimation for non-MF asset types.
// Phase 1: simple heuristics. Future phases may integrate live price feeds.

// Estimate current value based on asset type and stored data.
// Returns the best available value: explicit current_value > computed estimate > invested_amount.
export function estimateCurrentValue(asset) {
  // If current_value is explicitly set (user-provided or last updated), use it
  if (asset.current_value != null && asset.current_value > 0) {
    return asset.current_value
  }

  const metadata = parseMetadata(asset.metadata)
  const invested = asset.invested_amount || 0

  switch (asset.asset_type) {
    case 'fd':
      return estimateFdValue(asset, metadata)
    case 'pf_ppf':
    case 'epf':
      return estimateCompoundingValue(asset, metadata)
    case 'gold_sgb':
      return estimateSgbValue(asset, metadata)
    case 'nps':
      return estimateCompoundingValue(asset, metadata, 0.09)
    case 'gold_physical':
    case 'stock':
    case 'real_estate':
    case 'insurance':
    case 'other':
    default:
      // For assets without a valuation model, fall back to invested amount.
      // Users should update current_value manually for these.
      return invested
  }
}

// FD: compound interest with known rate and tenure
function estimateFdValue(asset, metadata) {
  const rate = asset.interest_rate || metadata.interest_rate || 0.065
  const invested = asset.invested_amount || 0
  if (!asset.purchase_date || !invested) return invested

  const yearsHeld = yearsSince(asset.purchase_date)
  if (yearsHeld <= 0) return invested

  // Quarterly compounding (most Indian bank FDs)
  const n = 4
  return invested * Math.pow(1 + rate / n, n * yearsHeld)
}

// PPF/EPF/NPS: annual compounding with assumed rate
function estimateCompoundingValue(asset, metadata, defaultRate = 0.071) {
  const rate = asset.interest_rate || metadata.interest_rate || defaultRate
  const invested = asset.invested_amount || 0
  if (!asset.purchase_date || !invested) return invested

  const yearsHeld = yearsSince(asset.purchase_date)
  if (yearsHeld <= 0) return invested

  // Annual compounding
  return invested * Math.pow(1 + rate, yearsHeld)
}

// SGB: 2.5% annual interest on issue price + gold appreciation (user updates current_value)
function estimateSgbValue(asset, metadata) {
  const invested = asset.invested_amount || 0
  if (!asset.purchase_date || !invested) return invested

  const yearsHeld = yearsSince(asset.purchase_date)
  const interestAccrued = invested * 0.025 * yearsHeld

  // Gold price appreciation must be captured via current_value updates.
  // This estimate only adds accrued interest to invested amount.
  return invested + interestAccrued
}

function yearsSince(dateStr) {
  const then = new Date(dateStr)
  if (isNaN(then.getTime())) return 0
  const now = new Date()
  return (now - then) / (365.25 * 24 * 60 * 60 * 1000)
}

function parseMetadata(meta) {
  if (!meta) return {}
  if (typeof meta === 'object') return meta
  try { return JSON.parse(meta) } catch { return {} }
}

// Returns a summary of the valuation method used for each asset type
export function getValuationMethod(assetType) {
  const methods = {
    fd: 'Quarterly compounding at stored/default rate (6.5%)',
    pf_ppf: 'Annual compounding at stored/default rate (7.1%)',
    epf: 'Annual compounding at stored/default rate (7.1%)',
    nps: 'Annual compounding at stored/default rate (9%)',
    gold_sgb: 'Invested amount + 2.5% annual interest accrual',
    stock: 'User-provided current value (no live feed)',
    gold_physical: 'User-provided current value',
    real_estate: 'User-provided current value',
    insurance: 'User-provided current value (surrender/maturity)',
    other: 'User-provided current value',
  }
  return methods[assetType] || 'User-provided current value'
}
