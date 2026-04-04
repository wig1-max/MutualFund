// Asset type taxonomy and classification for household assets.
// Parallel to fundClassification.js but for non-MF asset types.

export const ASSET_TYPES = {
  stock: { label: 'Stocks', taxClass: 'equity', liquidityClass: 'liquid' },
  fd: { label: 'Fixed Deposits', taxClass: 'debt_interest', liquidityClass: 'semi_liquid' },
  insurance: { label: 'Insurance', taxClass: 'insurance', liquidityClass: 'illiquid' },
  real_estate: { label: 'Real Estate', taxClass: 'real_estate', liquidityClass: 'illiquid' },
  pf_ppf: { label: 'PF / PPF', taxClass: 'exempt', liquidityClass: 'locked' },
  nps: { label: 'NPS', taxClass: 'nps', liquidityClass: 'locked' },
  gold_physical: { label: 'Gold (Physical)', taxClass: 'gold', liquidityClass: 'semi_liquid' },
  gold_sgb: { label: 'Gold (SGB)', taxClass: 'gold_sgb', liquidityClass: 'semi_liquid' },
  epf: { label: 'EPF', taxClass: 'exempt', liquidityClass: 'locked' },
  other: { label: 'Other', taxClass: 'other', liquidityClass: 'unknown' },
}

export const ASSET_SUBTYPES = {
  stock: ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'],
  fd: ['Bank FD', 'Corporate FD', 'Tax Saver FD', 'Post Office TD'],
  insurance: ['Term', 'Endowment', 'ULIP', 'Money Back', 'Whole Life', 'Health'],
  real_estate: ['Residential', 'Commercial', 'Plot', 'REIT'],
  pf_ppf: ['PPF', 'VPF'],
  nps: ['Tier 1', 'Tier 2'],
  gold_physical: ['Jewellery', 'Coins', 'Bars'],
  gold_sgb: ['SGB'],
  epf: ['EPF'],
  other: [],
}

export function getAssetTypeLabel(assetType) {
  return ASSET_TYPES[assetType]?.label || assetType
}

export function getTaxClass(assetType) {
  return ASSET_TYPES[assetType]?.taxClass || 'other'
}

export function getLiquidityClass(assetType) {
  return ASSET_TYPES[assetType]?.liquidityClass || 'unknown'
}

// Maps asset types to broad allocation buckets for wealth summary
export function getWealthBucket(assetType) {
  switch (assetType) {
    case 'stock': return 'equity'
    case 'fd': return 'debt'
    case 'insurance': return 'insurance'
    case 'real_estate': return 'real_estate'
    case 'pf_ppf':
    case 'epf': return 'retirement'
    case 'nps': return 'retirement'
    case 'gold_physical':
    case 'gold_sgb': return 'gold'
    default: return 'other'
  }
}

// Validates asset_type is one of the allowed enum values
export function isValidAssetType(type) {
  return type in ASSET_TYPES
}

// Validates asset_subtype against the asset_type's allowed subtypes
export function isValidSubtype(assetType, subtype) {
  if (!subtype) return true // subtype is optional
  const allowed = ASSET_SUBTYPES[assetType]
  if (!allowed || allowed.length === 0) return true // no restrictions
  return allowed.includes(subtype)
}
