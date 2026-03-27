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
