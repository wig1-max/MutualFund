import { Router } from 'express'
import { getDb } from '../db/index.js'
import { fetchNavHistory, fetchLatestNav } from '../services/mfapi.js'
import { calculateReturns } from '../services/calculations.js'
import { batchPrefetchNavs } from '../services/navCache.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

// Load static holdings data for overlap analysis
let fundHoldings = {}
try {
  const holdingsPath = path.join(__dirname, '..', 'data', 'fund-holdings.json')
  fundHoldings = JSON.parse(fs.readFileSync(holdingsPath, 'utf-8'))
} catch (e) {
  console.warn('fund-holdings.json not found, overlap analysis will be limited')
}

// GET /api/portfolio/total-aum — total invested across all clients
router.get('/portfolio/total-aum', (req, res) => {
  const db = getDb()
  const total = db.prepare(
    'SELECT COALESCE(SUM(invested_amount), 0) as totalAum FROM client_holdings'
  ).get()
  res.json({ totalAum: total.totalAum })
})

// GET /api/portfolio/:clientId — get all holdings for a client
router.get('/portfolio/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const holdings = db.prepare(
    'SELECT * FROM client_holdings WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.clientId)

  res.json({ client, holdings })
})

// POST /api/portfolio/:clientId/holdings — add a holding
router.post('/portfolio/:clientId/holdings', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const { scheme_code, scheme_name, invested_amount, units, purchase_date } = req.body
  if (!scheme_code || !invested_amount) {
    return res.status(400).json({ message: 'scheme_code and invested_amount are required' })
  }

  const result = db.prepare(`
    INSERT INTO client_holdings (client_id, scheme_code, scheme_name, invested_amount, units, purchase_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clientId,
    scheme_code,
    scheme_name || '',
    invested_amount,
    units || null,
    purchase_date || null
  )

  const holding = db.prepare('SELECT * FROM client_holdings WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(holding)
})

// PUT /api/portfolio/:clientId/holdings/:holdingId — update a holding
router.put('/portfolio/:clientId/holdings/:holdingId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT * FROM client_holdings WHERE id = ? AND client_id = ?'
  ).get(req.params.holdingId, req.params.clientId)
  if (!existing) return res.status(404).json({ message: 'Holding not found' })

  const { scheme_code, scheme_name, invested_amount, units, purchase_date } = req.body

  db.prepare(`
    UPDATE client_holdings SET
      scheme_code = ?, scheme_name = ?, invested_amount = ?, units = ?, purchase_date = ?
    WHERE id = ?
  `).run(
    scheme_code || existing.scheme_code,
    scheme_name ?? existing.scheme_name,
    invested_amount ?? existing.invested_amount,
    units ?? existing.units,
    purchase_date ?? existing.purchase_date,
    req.params.holdingId
  )

  const updated = db.prepare('SELECT * FROM client_holdings WHERE id = ?').get(req.params.holdingId)
  res.json(updated)
})

// DELETE /api/portfolio/:clientId/holdings/:holdingId — remove a holding
router.delete('/portfolio/:clientId/holdings/:holdingId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT * FROM client_holdings WHERE id = ? AND client_id = ?'
  ).get(req.params.holdingId, req.params.clientId)
  if (!existing) return res.status(404).json({ message: 'Holding not found' })

  db.prepare('DELETE FROM client_holdings WHERE id = ?').run(req.params.holdingId)
  res.json({ message: 'Holding deleted' })
})

// GET /api/portfolio/:clientId/analysis — full portfolio analysis
router.get('/portfolio/:clientId/analysis', async (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const holdings = db.prepare(
    'SELECT * FROM client_holdings WHERE client_id = ?'
  ).all(req.params.clientId)

  if (holdings.length === 0) {
    return res.json({
      client,
      holdings: [],
      summary: { totalInvested: 0, currentValue: 0, gain: 0, gainPercent: 0 },
      allocation: [],
      amcConcentration: [],
      overlap: [],
      underperformers: [],
    })
  }

  // Batch-prefetch all NAV histories (uses SQLite cache, only hits mfapi.in for misses)
  const schemeCodes = [...new Set(holdings.map(h => h.scheme_code))]
  const navDataMap = await batchPrefetchNavs(schemeCodes)

  // Enrich holdings with fund info and cached NAV data
  const enriched = holdings.map((h) => {
    try {
      const fundInfo = db.prepare('SELECT * FROM funds WHERE scheme_code = ?').get(h.scheme_code)
      const latestNav = fundInfo?.nav || null
      const category = fundInfo?.scheme_category || ''
      const amc = fundInfo?.amc || ''
      const schemeType = fundInfo?.scheme_type || ''

      let currentValue = h.invested_amount
      if (h.units && latestNav) {
        currentValue = h.units * latestNav
      }

      let returns = null
      const navData = navDataMap[h.scheme_code]
      if (navData && navData.length > 0) {
        returns = calculateReturns(navData)

        if (!h.units && h.purchase_date) {
          const latestNavData = navData[navData.length - 1]
          const purchaseNav = navData.find(d => d.date >= h.purchase_date)
          if (purchaseNav) {
            const estimatedUnits = h.invested_amount / purchaseNav.nav
            currentValue = estimatedUnits * latestNavData.nav
          }
        } else if (h.units) {
          currentValue = h.units * navData[navData.length - 1].nav
        }
      }

      return {
        ...h,
        currentNav: latestNav,
        currentValue,
        gain: currentValue - h.invested_amount,
        gainPercent: h.invested_amount > 0 ? ((currentValue - h.invested_amount) / h.invested_amount) * 100 : 0,
        category,
        amc,
        schemeType,
        returns,
      }
    } catch (e) {
      return {
        ...h,
        currentNav: null,
        currentValue: h.invested_amount,
        gain: 0,
        gainPercent: 0,
        category: '',
        amc: '',
        schemeType: '',
        returns: null,
      }
    }
  })

  // Summary
  const totalInvested = enriched.reduce((s, h) => s + h.invested_amount, 0)
  const currentValue = enriched.reduce((s, h) => s + h.currentValue, 0)

  // Asset Allocation by category
  const allocationMap = {}
  for (const h of enriched) {
    const cat = categorizeFund(h.category)
    allocationMap[cat] = (allocationMap[cat] || 0) + h.currentValue
  }
  const allocation = Object.entries(allocationMap).map(([category, value]) => ({
    category,
    value,
    percent: currentValue > 0 ? (value / currentValue) * 100 : 0,
  })).sort((a, b) => b.value - a.value)

  // AMC Concentration
  const amcMap = {}
  for (const h of enriched) {
    const amc = h.amc || 'Unknown'
    amcMap[amc] = (amcMap[amc] || 0) + h.currentValue
  }
  const amcConcentration = Object.entries(amcMap).map(([amc, value]) => ({
    amc,
    value,
    percent: currentValue > 0 ? (value / currentValue) * 100 : 0,
  })).sort((a, b) => b.value - a.value)

  // Overlap Analysis
  const overlap = calculateOverlap(enriched)

  // Underperformer Detection
  // Compare each fund's 1Y return to category average
  const categoryReturns = {}
  for (const h of enriched) {
    if (h.returns?.['1Y']?.return != null) {
      const cat = h.category || 'Unknown'
      if (!categoryReturns[cat]) categoryReturns[cat] = []
      categoryReturns[cat].push(h.returns['1Y'].return)
    }
  }
  const categoryAvg = {}
  for (const [cat, rets] of Object.entries(categoryReturns)) {
    categoryAvg[cat] = rets.reduce((s, r) => s + r, 0) / rets.length
  }

  const underperformers = enriched.filter(h => {
    if (!h.returns) return false
    const ret1Y = h.returns['1Y']?.return
    const ret3Y = h.returns['3Y']?.return
    // Flag if underperforming: negative 1Y return OR significantly below category average
    if (ret1Y != null && ret1Y < 0) return true
    if (ret1Y != null && ret3Y != null) {
      // Both below category average (or below zero)
      return ret1Y < (categoryAvg[h.category] || 0) - 5 && ret3Y < 10
    }
    return false
  }).map(h => ({
    id: h.id,
    scheme_code: h.scheme_code,
    scheme_name: h.scheme_name,
    category: h.category,
    return1Y: h.returns?.['1Y']?.return,
    return3Y: h.returns?.['3Y']?.return,
    currentValue: h.currentValue,
  }))

  res.json({
    client,
    holdings: enriched.map(h => ({
      id: h.id,
      scheme_code: h.scheme_code,
      scheme_name: h.scheme_name,
      invested_amount: h.invested_amount,
      units: h.units,
      purchase_date: h.purchase_date,
      currentNav: h.currentNav,
      currentValue: h.currentValue,
      gain: h.gain,
      gainPercent: h.gainPercent,
      category: h.category,
      amc: h.amc,
      returns: h.returns ? {
        '1Y': h.returns['1Y']?.return ?? null,
        '3Y': h.returns['3Y']?.return ?? null,
        '5Y': h.returns['5Y']?.return ?? null,
      } : null,
    })),
    summary: {
      totalInvested,
      currentValue,
      gain: currentValue - totalInvested,
      gainPercent: totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0,
    },
    allocation,
    amcConcentration,
    overlap,
    underperformers,
  })
})

// Helper: categorize fund into broad asset class
function categorizeFund(category) {
  if (!category) return 'Other'
  const lower = category.toLowerCase()
  if (lower.includes('equity') || lower.includes('large cap') || lower.includes('mid cap') ||
      lower.includes('small cap') || lower.includes('flexi cap') || lower.includes('multi cap') ||
      lower.includes('elss') || lower.includes('value') || lower.includes('contra') ||
      lower.includes('focused') || lower.includes('dividend yield') || lower.includes('sectoral') ||
      lower.includes('thematic')) return 'Equity'
  if (lower.includes('debt') || lower.includes('liquid') || lower.includes('money market') ||
      lower.includes('overnight') || lower.includes('gilt') || lower.includes('banking and psu') ||
      lower.includes('corporate bond') || lower.includes('credit risk') || lower.includes('short') ||
      lower.includes('medium') || lower.includes('long') || lower.includes('dynamic bond') ||
      lower.includes('floater')) return 'Debt'
  if (lower.includes('hybrid') || lower.includes('balanced') || lower.includes('aggressive') ||
      lower.includes('conservative') || lower.includes('arbitrage') || lower.includes('equity savings')) return 'Hybrid'
  if (lower.includes('gold') || lower.includes('silver') || lower.includes('commodity')) return 'Gold/Commodity'
  if (lower.includes('international') || lower.includes('global') || lower.includes('overseas')) return 'International'
  if (lower.includes('index') || lower.includes('etf')) return 'Index/ETF'
  if (lower.includes('solution') || lower.includes('retirement') || lower.includes('children')) return 'Solution Oriented'
  return 'Other'
}

// Helper: calculate overlap between funds using static holdings data
function calculateOverlap(enrichedHoldings) {
  const results = []
  const fundCodes = enrichedHoldings.map(h => h.scheme_code)

  for (let i = 0; i < fundCodes.length; i++) {
    for (let j = i + 1; j < fundCodes.length; j++) {
      const code1 = fundCodes[i]
      const code2 = fundCodes[j]
      const holdings1 = fundHoldings[code1]?.holdings || []
      const holdings2 = fundHoldings[code2]?.holdings || []

      if (holdings1.length === 0 || holdings2.length === 0) continue

      const set1 = new Set(holdings1.map(h => h.toLowerCase()))
      const common = holdings2.filter(h => set1.has(h.toLowerCase()))

      if (common.length > 0) {
        const overlapPercent = (common.length / Math.min(holdings1.length, holdings2.length)) * 100
        results.push({
          fund1: { code: code1, name: enrichedHoldings[i].scheme_name },
          fund2: { code: code2, name: enrichedHoldings[j].scheme_name },
          commonHoldings: common,
          commonCount: common.length,
          overlapPercent,
        })
      }
    }
  }

  return results.sort((a, b) => b.overlapPercent - a.overlapPercent)
}

export default router
