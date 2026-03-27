// Determine if a fund is equity-oriented based on its AMFI category.
// Used for tax treatment classification (equity vs debt rates).
export function isEquityFund(category) {
  if (!category) return false
  const lower = category.toLowerCase()
  return (
    lower.includes('equity') || lower.includes('large cap') || lower.includes('mid cap') ||
    lower.includes('small cap') || lower.includes('flexi cap') || lower.includes('multi cap') ||
    lower.includes('elss') || lower.includes('value') || lower.includes('contra') ||
    lower.includes('focused') || lower.includes('dividend yield') || lower.includes('sectoral') ||
    lower.includes('thematic') || lower.includes('index') || lower.includes('etf') ||
    // Hybrid equity-oriented (>=65% equity allocation — treated as equity for tax)
    lower.includes('aggressive hybrid') || lower.includes('balanced advantage') ||
    lower.includes('equity savings')
  )
}

export function getCategoryRiskLevel(category) {
  if (!category) return 'moderate'
  const lower = category.toLowerCase()

  if (lower.includes('overnight') || lower.includes('liquid') || lower.includes('money market'))
    return 'very_low'

  if (lower.includes('ultra short') || lower.includes('low duration') || lower.includes('floater'))
    return 'low'

  if (lower.includes('short duration') || lower.includes('banking and psu') ||
      lower.includes('corporate bond') || lower.includes('gilt') || lower.includes('credit risk'))
    return 'low_moderate'

  if (lower.includes('hybrid') || lower.includes('balanced advantage') ||
      lower.includes('equity savings') || lower.includes('arbitrage'))
    return 'moderate'

  if (lower.includes('large cap') || lower.includes('index') || lower.includes('flexi cap') ||
      lower.includes('multi cap') || lower.includes('elss') || lower.includes('focused') ||
      lower.includes('value') || lower.includes('contra') || lower.includes('dividend'))
    return 'moderate_high'

  if (lower.includes('mid cap') || lower.includes('aggressive hybrid'))
    return 'high'

  if (lower.includes('small cap') || lower.includes('sectoral') || lower.includes('thematic') ||
      lower.includes('international') || lower.includes('global'))
    return 'very_high'

  return 'moderate'
}

const riskScores = {
  very_low: 10,
  low: 25,
  low_moderate: 40,
  moderate: 55,
  moderate_high: 70,
  high: 85,
  very_high: 95
}

export function riskLevelToScore(level) {
  return riskScores[level] ?? 55
}

export function getAllocationBucket(category) {
  if (!category) return 'other'
  const lower = category.toLowerCase()

  if (lower.includes('liquid') || lower.includes('money market') || lower.includes('overnight'))
    return 'liquid'

  if (lower.includes('debt') || lower.includes('gilt') || lower.includes('banking and psu') ||
      lower.includes('corporate bond') || lower.includes('credit risk') || lower.includes('short') ||
      lower.includes('medium') || lower.includes('long') || lower.includes('dynamic bond') ||
      lower.includes('floater') || lower.includes('ultra short') || lower.includes('low duration'))
    return 'debt'

  if (lower.includes('gold') || lower.includes('silver') || lower.includes('commodity'))
    return 'gold'

  if (lower.includes('international') || lower.includes('global') || lower.includes('overseas'))
    return 'international'

  if (lower.includes('hybrid') || lower.includes('balanced') || lower.includes('aggressive') ||
      lower.includes('conservative') || lower.includes('arbitrage') || lower.includes('equity savings'))
    return 'hybrid'

  if (lower.includes('solution') || lower.includes('retirement') || lower.includes('children'))
    return 'solution'

  if (lower.includes('equity') || lower.includes('large cap') || lower.includes('mid cap') ||
      lower.includes('small cap') || lower.includes('flexi cap') || lower.includes('multi cap') ||
      lower.includes('elss') || lower.includes('value') || lower.includes('contra') ||
      lower.includes('focused') || lower.includes('dividend yield') || lower.includes('sectoral') ||
      lower.includes('thematic') || lower.includes('index') || lower.includes('etf'))
    return 'equity'

  return 'other'
}

export function isELSS(category) {
  if (!category) return false
  return category.toLowerCase().includes('elss')
}

export function isPassiveFund(name, category) {
  const lower = ((name || '') + ' ' + (category || '')).toLowerCase()
  return (
    lower.includes('index') || lower.includes('etf') ||
    lower.includes('nifty') || lower.includes('sensex') || lower.includes('passive')
  )
}
