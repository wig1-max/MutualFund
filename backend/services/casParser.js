import { getDb } from '../db/index.js'

export function parseCasText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)

  let pan = null
  const folios = []
  const transactions = []
  let current = { amc: null, folio_number: null, isin: null, scheme_name: null }

  const panRe = /PAN\s*:\s*([A-Z]{5}[0-9]{4}[A-Z])/i
  const folioRe = /Folio\s*(?:No|Number)?\s*:\s*([\w\/]+)/i
  const isinRe = /ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{10})/i
  const balanceRe = /(?:Closing\s+)?(?:Unit\s+)?Balance\s*:\s*([\d,]+\.?\d*)/i
  const marketRe = /Market\s+Value.*?:\s*(?:INR|₹|Rs\.?)?\s*([\d,]+\.?\d*)/i
  const costRe = /(?:Purchase\s+Cost|Cost\s+Value).*?:\s*([\d,]+\.?\d*)/i
  const navRe = /NAV.*?:\s*(?:INR|₹|Rs\.?)?\s*([\d,]+\.?\d*)/i

  // Transaction line pattern: DD-Mon-YYYY or DD/MM/YYYY followed by description, amount, units, nav, balance
  const txnDateRe = /^(\d{2}[-\/]\w{3}[-\/]\d{4}|\d{2}[-\/]\d{2}[-\/]\d{4})\s+(.+)/
  // Numeric columns at end of a transaction line: amount, units, nav, unit_balance
  const txnNumbersRe = /([\d,]+\.\d{2,4})\s+([\d,]+\.\d{2,4})\s+([\d,]+\.\d{2,4})\s*$/

  // Dividend patterns
  const dividendRe = /dividend/i
  const dividendPayoutRe = /dividend\s*(?:payout|paid|credited)/i
  const dividendReinvestRe = /dividend\s*(?:reinvest|re-?invest)/i

  function parseNum(s) {
    return parseFloat(s.replace(/,/g, '')) || 0
  }

  function parseDate(s) {
    if (!s) return null
    // Handle DD-Mon-YYYY (e.g., 15-Jan-2024)
    const monMatch = s.match(/^(\d{2})[-\/](\w{3})[-\/](\d{4})$/)
    if (monMatch) {
      const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
      const mon = months[monMatch[2].toLowerCase()]
      if (mon) return `${monMatch[3]}-${mon}-${monMatch[1]}`
    }
    // Handle DD/MM/YYYY
    const slashMatch = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/)
    if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`
    return s
  }

  function classifyTransaction(description) {
    const desc = description.toLowerCase()
    if (dividendPayoutRe.test(desc)) return 'dividend_payout'
    if (dividendReinvestRe.test(desc)) return 'dividend_reinvest'
    if (dividendRe.test(desc)) return 'dividend_payout'
    if (/switch\s*-?\s*in|switched?\s+in/i.test(desc)) return 'switch_in'
    if (/switch\s*-?\s*out|switched?\s+out/i.test(desc)) return 'switch_out'
    if (/systematic\s+transfer.*in|stp.*in/i.test(desc)) return 'stp_in'
    if (/systematic\s+transfer.*out|stp.*out/i.test(desc)) return 'stp_out'
    if (/sip|systematic\s+investment/i.test(desc)) return 'sip'
    if (/redemption|redeem|withdraw/i.test(desc)) return 'redemption'
    if (/purchase|buy|subscription|additional|new\s+fund\s+offer|nfo/i.test(desc)) return 'purchase'
    return 'other'
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

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

    // Try to parse transaction lines (date at start followed by description + numbers)
    const txnMatch = line.match(txnDateRe)
    if (txnMatch && current.scheme_name) {
      const dateStr = txnMatch[1]
      const rest = txnMatch[2]
      const numMatch = rest.match(txnNumbersRe)
      if (numMatch) {
        const descPart = rest.replace(txnNumbersRe, '').trim()
        const amount = parseNum(numMatch[1])
        const units = parseNum(numMatch[2])
        const nav = parseNum(numMatch[3])
        const txnType = classifyTransaction(descPart)

        transactions.push({
          amc: current.amc || null,
          folio_number: current.folio_number || null,
          isin: current.isin || null,
          scheme_name: current.scheme_name || null,
          transaction_type: txnType,
          transaction_date: parseDate(dateStr),
          amount,
          units,
          nav,
          description: descPart || null,
        })
        continue
      }
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

  return {
    pan,
    folios,
    transactions,
    parsed_count: folios.length,
    transaction_count: transactions.length,
    raw_lines: lines.length,
  }
}

export function enrichWithSchemeCodes(folios, db) {
  return folios.map(f => {
    const scheme_code = matchSchemeCode(f.isin, f.scheme_name, db)
    return { ...f, scheme_code }
  })
}

export function enrichTransactionsWithSchemeCodes(transactions, db) {
  // Cache lookups to avoid repeated DB queries for same ISIN/name
  const cache = new Map()
  return transactions.map(t => {
    const key = `${t.isin || ''}|${t.scheme_name || ''}`
    if (!cache.has(key)) {
      cache.set(key, matchSchemeCode(t.isin, t.scheme_name, db))
    }
    return { ...t, scheme_code: cache.get(key) }
  })
}

function matchSchemeCode(isin, schemeName, db) {
  let scheme_code = null

  // 1. Try exact ISIN match
  if (isin) {
    const byIsin = db.prepare(
      'SELECT scheme_code FROM funds WHERE isin_growth = ? OR isin_reinvest = ? LIMIT 1'
    ).get(isin, isin)
    if (byIsin) return byIsin.scheme_code
  }

  // 2. Try strict name match (all words > 3 chars)
  if (schemeName) {
    const words = schemeName.split(/\s+/).filter(w => w.length > 3)
    // Try with more words first for better accuracy, then relax
    for (let count = Math.min(words.length, 6); count >= 3; count--) {
      const pattern = '%' + words.slice(0, count).join('%') + '%'
      const byName = db.prepare(
        'SELECT scheme_code FROM funds WHERE scheme_name LIKE ? LIMIT 1'
      ).get(pattern)
      if (byName) return byName.scheme_code
    }

    // 3. Fallback: try key identifiers (AMC name + fund type keywords)
    const keyWords = schemeName.split(/\s+/).filter(w =>
      w.length > 2 && !/^(the|and|for|with|fund|plan|option|growth|direct|regular|div|idcw)$/i.test(w)
    ).slice(0, 3)
    if (keyWords.length >= 2) {
      const pattern = '%' + keyWords.join('%') + '%'
      const byKey = db.prepare(
        'SELECT scheme_code FROM funds WHERE scheme_name LIKE ? LIMIT 1'
      ).get(pattern)
      if (byKey) return byKey.scheme_code
    }
  }

  return scheme_code
}
