import { getDb } from '../db/index.js'

export function parseCasText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)

  let pan = null
  const folios = []
  let current = { amc: null, folio_number: null, isin: null, scheme_name: null }

  const panRe = /PAN\s*:\s*([A-Z]{5}[0-9]{4}[A-Z])/i
  const folioRe = /Folio\s*(?:No|Number)?\s*:\s*([\w\/]+)/i
  const isinRe = /ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{10})/i
  const balanceRe = /(?:Closing\s+)?(?:Unit\s+)?Balance\s*:\s*([\d,]+\.?\d*)/i
  const marketRe = /Market\s+Value.*?:\s*(?:INR|₹|Rs\.?)?\s*([\d,]+\.?\d*)/i
  const costRe = /(?:Purchase\s+Cost|Cost\s+Value).*?:\s*([\d,]+\.?\d*)/i
  const navRe = /NAV.*?:\s*(?:INR|₹|Rs\.?)?\s*([\d,]+\.?\d*)/i

  function parseNum(s) {
    return parseFloat(s.replace(/,/g, '')) || 0
  }

  function isAmcLine(line) {
    return (line.includes('Mutual Fund') || line.includes('Asset Management')) &&
      !line.includes(':') && line.length < 80
  }

  function isFundNameLine(line) {
    return (line.includes('Fund') || line.includes('Plan')) &&
      !line.includes(':') && line.length >= 10 && line.length <= 120 &&
      !/^\d/.test(line)
  }

  for (const line of lines) {
    const panMatch = line.match(panRe)
    if (panMatch && !pan) {
      pan = panMatch[1].toUpperCase()
      continue
    }

    if (isAmcLine(line)) {
      current.amc = line
      continue
    }

    const folioMatch = line.match(folioRe)
    if (folioMatch) {
      current.folio_number = folioMatch[1]
      continue
    }

    const isinMatch = line.match(isinRe)
    if (isinMatch) {
      current.isin = isinMatch[1].toUpperCase()
      continue
    }

    const balanceMatch = line.match(balanceRe)
    if (balanceMatch) {
      current.units = parseNum(balanceMatch[1])
      continue
    }

    const costMatch = line.match(costRe)
    if (costMatch) {
      current.cost_value = parseNum(costMatch[1])
      continue
    }

    const navMatch = line.match(navRe)
    if (navMatch) {
      current.nav = parseNum(navMatch[1])
      continue
    }

    const marketMatch = line.match(marketRe)
    if (marketMatch) {
      current.current_value = parseNum(marketMatch[1])
      // Market value line signals end of a fund entry
      folios.push({
        amc: current.amc || null,
        folio_number: current.folio_number || null,
        isin: current.isin || null,
        scheme_name: current.scheme_name || null,
        units: current.units || 0,
        nav: current.nav || 0,
        current_value: current.current_value,
        cost_value: current.cost_value || 0,
      })
      // Reset fund-level fields but keep amc and folio
      current = {
        amc: current.amc,
        folio_number: current.folio_number,
        isin: null,
        scheme_name: null,
        units: undefined,
        nav: undefined,
        cost_value: undefined,
        current_value: undefined,
      }
      continue
    }

    if (isFundNameLine(line)) {
      current.scheme_name = line
    }
  }

  return { pan, folios, parsed_count: folios.length, raw_lines: lines.length }
}

export function enrichWithSchemeCodes(folios, db) {
  return folios.map(f => {
    let scheme_code = null

    // Try ISIN match first
    if (f.isin) {
      const byIsin = db.prepare(
        'SELECT scheme_code FROM funds WHERE isin_growth = ? OR isin_reinvest = ? LIMIT 1'
      ).get(f.isin, f.isin)
      if (byIsin) scheme_code = byIsin.scheme_code
    }

    // Fallback to fuzzy name match
    if (!scheme_code && f.scheme_name) {
      const words = f.scheme_name.split(/\s+/).filter(w => w.length > 3).slice(0, 4)
      if (words.length > 0) {
        const pattern = '%' + words.join('%') + '%'
        const byName = db.prepare(
          'SELECT scheme_code FROM funds WHERE scheme_name LIKE ? LIMIT 1'
        ).get(pattern)
        if (byName) scheme_code = byName.scheme_code
      }
    }

    return { ...f, scheme_code }
  })
}
