import { Router } from 'express'
import { syncAmfiData, searchFunds, getFundByCode, getCategories } from '../services/amfi.js'
import { fetchNavHistory, fetchLatestNav } from '../services/mfapi.js'
import * as calc from '../services/calculations.js'

const router = Router()

// Sync AMFI data
router.post('/funds/sync', async (req, res) => {
  try {
    const result = await syncAmfiData()
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: 'Failed to sync AMFI data', detail: err.message })
  }
})

// Search funds
router.get('/funds/search', (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])
  const results = searchFunds(q)
  res.json(results)
})

// Get categories
router.get('/funds/categories', (req, res) => {
  res.json(getCategories())
})

// Get fund NAV history
router.get('/funds/:code/nav', async (req, res) => {
  try {
    const data = await fetchNavHistory(req.params.code)
    res.json(data)
  } catch (err) {
    res.status(404).json({ message: err.message })
  }
})

// Get latest NAV
router.get('/funds/:code/nav/latest', async (req, res) => {
  try {
    const data = await fetchLatestNav(req.params.code)
    res.json(data)
  } catch (err) {
    res.status(404).json({ message: err.message })
  }
})

// Calculate returns for a fund
router.get('/funds/:code/returns', async (req, res) => {
  try {
    const { data: navData } = await fetchNavHistory(req.params.code)
    const returns = calc.calculateReturns(navData)
    res.json(returns)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Rolling returns
router.get('/funds/:code/returns/rolling', async (req, res) => {
  try {
    const window = parseFloat(req.query.window) || 1
    const period = req.query.period || '5y'
    const periodYears = parseFloat(period) || 5
    const { data: navData } = await fetchNavHistory(req.params.code)
    const results = calc.rollingReturns(navData, window, periodYears)
    res.json(results)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Risk metrics
router.get('/funds/:code/risk', async (req, res) => {
  try {
    const { data: navData } = await fetchNavHistory(req.params.code)
    const period = parseFloat(req.query.period) || 3
    res.json({
      standardDeviation: calc.standardDeviation(navData, period),
      maxDrawdown: calc.maxDrawdown(navData, period),
      sharpeRatio: calc.sharpeRatio(navData, 6, period),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Compare multiple funds
router.get('/funds/compare', async (req, res) => {
  try {
    let codes = req.query.codes
    if (!codes) return res.status(400).json({ message: 'Provide codes query param' })
    if (!Array.isArray(codes)) codes = [codes]

    const results = await Promise.all(
      codes.map(async (code) => {
        try {
          const { meta, data: navData } = await fetchNavHistory(code)
          const fundInfo = getFundByCode(code)
          return {
            code,
            name: meta?.scheme_name || fundInfo?.scheme_name || code,
            category: meta?.scheme_category || fundInfo?.scheme_category || '',
            amc: fundInfo?.amc || '',
            returns: calc.calculateReturns(navData),
            risk: {
              standardDeviation: calc.standardDeviation(navData),
              maxDrawdown: calc.maxDrawdown(navData),
              sharpeRatio: calc.sharpeRatio(navData),
            },
          }
        } catch (err) {
          return { code, error: err.message }
        }
      })
    )
    res.json(results)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// SIP Backtest
router.get('/funds/sip-backtest', async (req, res) => {
  try {
    const { code, sip, start, end } = req.query
    if (!code || !sip || !start) {
      return res.status(400).json({ message: 'Provide code, sip amount, and start date' })
    }
    const { data: navData } = await fetchNavHistory(code)
    const result = calc.sipBacktest(navData, parseFloat(sip), start, end || null)
    if (!result) return res.status(400).json({ message: 'No data for given date range' })
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Category heatmap
router.get('/funds/heatmap', async (req, res) => {
  try {
    const categories = getCategories()
    // For heatmap, we return category-level data
    // Detailed return calculation would require fetching NAVs for representative index funds
    // For now, return category stats from AMFI data
    res.json(categories.map(c => ({
      category: c.scheme_category,
      type: c.scheme_type,
      fundCount: c.fund_count,
    })))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
