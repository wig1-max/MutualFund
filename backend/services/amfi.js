import { getDb } from '../db/index.js'

const AMFI_URL = 'https://www.amfiindia.com/spages/NAVAll.txt'

export async function syncAmfiData() {
  const res = await fetch(AMFI_URL)
  const text = await res.text()
  const lines = text.split('\n')

  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO funds (scheme_code, isin_growth, isin_reinvest, scheme_name, nav, nav_date, scheme_type, scheme_category, amc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scheme_code) DO UPDATE SET
      isin_growth = excluded.isin_growth,
      isin_reinvest = excluded.isin_reinvest,
      scheme_name = excluded.scheme_name,
      nav = excluded.nav,
      nav_date = excluded.nav_date,
      scheme_type = excluded.scheme_type,
      scheme_category = excluded.scheme_category,
      amc = excluded.amc,
      updated_at = datetime('now')
  `)

  let currentType = ''
  let currentCategory = ''
  let currentAmc = ''
  let count = 0

  const insertMany = db.transaction((records) => {
    for (const r of records) {
      upsert.run(r.schemeCode, r.isinGrowth, r.isinReinvest, r.schemeName, r.nav, r.navDate, r.schemeType, r.schemeCategory, r.amc)
    }
  })

  const records = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Lines without semicolons are headers
    if (!trimmed.includes(';')) {
      // Check if it's a type/category header or AMC name
      if (trimmed.startsWith('Open Ended') || trimmed.startsWith('Close Ended') || trimmed.startsWith('Interval')) {
        // Format: "Open Ended Schemes(Debt Scheme - Banking and PSU Fund)"
        const match = trimmed.match(/^(Open Ended|Close Ended|Interval)\s*Schemes?\s*\((.+)\)$/i)
        if (match) {
          currentType = match[1] + ' Schemes'
          currentCategory = match[2]
        }
      } else if (trimmed !== 'Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date') {
        currentAmc = trimmed
      }
      continue
    }

    const parts = trimmed.split(';')
    if (parts.length < 6) continue
    if (parts[0] === 'Scheme Code') continue // header row

    const [schemeCode, isinGrowth, isinReinvest, schemeName, navStr, navDate] = parts
    const nav = parseFloat(navStr)

    if (schemeCode && schemeName && !isNaN(nav)) {
      records.push({
        schemeCode: schemeCode.trim(),
        isinGrowth: isinGrowth?.trim() || '',
        isinReinvest: isinReinvest?.trim() || '',
        schemeName: schemeName.trim(),
        nav,
        navDate: navDate?.trim() || '',
        schemeType: currentType,
        schemeCategory: currentCategory,
        amc: currentAmc,
      })
      count++
    }
  }

  insertMany(records)
  return { synced: count }
}

export function searchFunds(query, limit = 50) {
  const db = getDb()
  return db.prepare(
    `SELECT scheme_code, scheme_name, nav, nav_date, scheme_category, amc
     FROM funds
     WHERE scheme_name LIKE ?
     ORDER BY scheme_name
     LIMIT ?`
  ).all(`%${query}%`, limit)
}

export function getFundByCode(schemeCode) {
  const db = getDb()
  return db.prepare('SELECT * FROM funds WHERE scheme_code = ?').get(schemeCode)
}

export function getCategories() {
  const db = getDb()
  return db.prepare(
    `SELECT scheme_category, scheme_type, COUNT(*) as fund_count, AVG(nav) as avg_nav
     FROM funds
     WHERE scheme_category != ''
     GROUP BY scheme_category, scheme_type
     ORDER BY scheme_type, scheme_category`
  ).all()
}
