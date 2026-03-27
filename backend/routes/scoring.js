import { Router } from 'express'
import { getDb } from '../db/index.js'
import { scoreClientFunds, storeFundMetrics } from '../services/scoringEngine.js'
import { fetchNavHistory } from '../services/mfapi.js'
import { calculateReturns } from '../services/calculations.js'

const router = Router()

// POST /api/scoring/:clientId/run — run scoring engine for client
router.post('/scoring/:clientId/run', async (req, res) => {
  try {
    const result = await scoreClientFunds(Number(req.params.clientId))
    res.json(result)
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('profile not found')) {
      return res.status(400).json({ message: err.message })
    }
    res.status(500).json({ message: err.message || 'Scoring failed' })
  }
})

// GET /api/scoring/:clientId/recommendations — get stored recommendations
router.get('/scoring/:clientId/recommendations', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const profile = db.prepare('SELECT * FROM client_profiles WHERE client_id = ?').get(req.params.clientId)
  if (profile && profile.questionnaire_responses) {
    try { profile.questionnaire_responses = JSON.parse(profile.questionnaire_responses) } catch {}
  }

  const recommendations = db.prepare(
    'SELECT * FROM fund_recommendations WHERE client_id = ? ORDER BY rank ASC'
  ).all(req.params.clientId)

  for (const rec of recommendations) {
    if (rec.reasons) {
      try { rec.reasons = JSON.parse(rec.reasons) } catch {}
    }
  }

  const generated_at = recommendations.length > 0 ? recommendations[0].generated_at : null

  res.json({ client, profile: profile || null, recommendations, generated_at })
})

// POST /api/scoring/enrich-metrics/:schemeCode — compute and store fund metrics
router.post('/scoring/enrich-metrics/:schemeCode', async (req, res) => {
  const schemeCode = req.params.schemeCode
  if (!/^\d{4,6}$/.test(schemeCode)) {
    return res.status(400).json({ message: 'Invalid scheme code' })
  }

  try {
    const navHistory = await fetchNavHistory(schemeCode)
    if (!navHistory || navHistory.length === 0) {
      return res.status(404).json({ message: 'No NAV history found' })
    }

    const returns = calculateReturns(navHistory)

    // Compute standard deviation of daily returns
    const dailyReturns = []
    for (let i = 1; i < navHistory.length; i++) {
      if (navHistory[i - 1].nav > 0) {
        dailyReturns.push((navHistory[i].nav - navHistory[i - 1].nav) / navHistory[i - 1].nav)
      }
    }

    let std_deviation = 0
    if (dailyReturns.length > 1) {
      const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
      const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1)
      std_deviation = Math.sqrt(variance) * Math.sqrt(252) // annualised
    }

    // Max drawdown
    let max_drawdown = 0
    let peak = navHistory[0]?.nav || 0
    for (const point of navHistory) {
      if (point.nav > peak) peak = point.nav
      const drawdown = peak > 0 ? (peak - point.nav) / peak : 0
      if (drawdown > max_drawdown) max_drawdown = drawdown
    }

    // Sharpe ratio (assume risk-free rate 6% annualised)
    const riskFreeDaily = 0.06 / 252
    let sharpe_ratio = 0
    if (dailyReturns.length > 1 && std_deviation > 0) {
      const meanDaily = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
      const annualisedReturn = meanDaily * 252
      sharpe_ratio = (annualisedReturn - 0.06) / std_deviation
    }

    const metrics = {
      scheme_code: schemeCode,
      std_deviation: Math.round(std_deviation * 10000) / 10000,
      max_drawdown: Math.round(max_drawdown * 10000) / 10000,
      sharpe_ratio: Math.round(sharpe_ratio * 100) / 100,
      return_1y: returns['1Y']?.return ?? null,
      return_3y: returns['3Y']?.return ?? null,
      return_5y: returns['5Y']?.return ?? null,
      category_avg_1y: null,
      category_avg_3y: null,
      risk_level: std_deviation > 0.25 ? 'very_high' : std_deviation > 0.20 ? 'high' : std_deviation > 0.15 ? 'moderate' : std_deviation > 0.08 ? 'low' : 'very_low',
      metrics_date: navHistory[navHistory.length - 1]?.date || null,
    }

    storeFundMetrics(metrics)
    res.json(metrics)
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to compute metrics' })
  }
})

export default router
