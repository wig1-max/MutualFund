import { Router } from 'express'
import { getDb } from '../db/index.js'
import { scoreClientFunds, storeFundMetrics } from '../services/scoringEngine.js'
import { fetchNavHistory } from '../services/mfapi.js'
import { calculateReturns, standardDeviation, maxDrawdown,
         sharpeRatio, sortinoRatio, calmarRatio,
         jensensAlpha, fundAgeYears } from '../services/calculations.js'
import { getCategoryRiskLevel } from '../utils/fundClassification.js'

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

  res.json({
    client,
    profile: profile || null,
    recommendations,
    survival_analysis: null,  // populated when scoring is re-run
    generated_at: recommendations[0]?.generated_at || null,
    metadata: {
      scoring_version: '2.0',
      metrics_included: ['sortino', 'calmar', 'jensen_alpha', 'monte_carlo'],
    },
  })
})

// POST /api/scoring/enrich-metrics/:schemeCode — compute and store fund metrics
router.post('/scoring/enrich-metrics/:schemeCode', async (req, res) => {
  const { schemeCode } = req.params
  try {
    const db = getDb()

    // Fetch fund NAV history
    const { data: navData } = await fetchNavHistory(schemeCode)
    if (!navData || navData.length < 30) {
      return res.status(400).json({
        message: 'Insufficient NAV history (need 30+ data points)'
      })
    }

    // Fetch Nifty 500 benchmark (scheme code 118989 is Axis Bluechip
    // as proxy — replace with actual Nifty 500 index fund later)
    // Use scheme code 100356 (UTI Nifty 50 Index) as benchmark proxy
    let benchmarkData = null
    try {
      const benchResult = await fetchNavHistory('100356')
      benchmarkData = benchResult.data
    } catch (e) {
      console.warn('Benchmark fetch failed, skipping alpha calculation')
    }

    // Compute all metrics
    const returns = calculateReturns(navData)
    const sd = standardDeviation(navData, 3)
    const dd = maxDrawdown(navData, 3)
    const sharpe = sharpeRatio(navData, 6, 3)
    const sortino = sortinoRatio(navData, 6, 3)
    const calmar = calmarRatio(navData, 3)
    const ageYears = fundAgeYears(navData)

    let alpha = null
    let beta = null
    if (benchmarkData && benchmarkData.length >= 30) {
      const alphaResult = jensensAlpha(navData, benchmarkData, 6, 3)
      if (alphaResult) {
        alpha = alphaResult.alpha
        beta = alphaResult.beta
      }
    }

    const fundInfo = db.prepare(
      'SELECT scheme_category FROM funds WHERE scheme_code = ?'
    ).get(schemeCode)

    // Store enriched metrics
    storeFundMetrics({
      scheme_code: schemeCode,
      std_deviation: sd,
      max_drawdown: dd,
      sharpe_ratio: sharpe,
      sortino_ratio: sortino,
      calmar_ratio: calmar,
      jensen_alpha: alpha,
      return_1y: returns['1Y']?.return ?? null,
      return_3y: returns['3Y']?.return ?? null,
      return_5y: returns['5Y']?.return ?? null,
      category_avg_1y: null,
      category_avg_3y: null,
      risk_level: fundInfo
        ? getCategoryRiskLevel(fundInfo.scheme_category)
        : null,
      metrics_date: navData[navData.length - 1]?.date || null,
    })

    res.json({
      scheme_code: schemeCode,
      age_years: Math.round(ageYears * 10) / 10,
      metrics: {
        sharpe: sharpe?.toFixed(3),
        sortino: sortino?.toFixed(3),
        calmar: calmar?.toFixed(3),
        jensen_alpha: alpha?.toFixed(2),
        beta: beta?.toFixed(3),
        max_drawdown: dd?.toFixed(2),
        std_deviation: sd?.toFixed(2),
        return_1y: returns['1Y']?.return?.toFixed(2),
        return_3y: returns['3Y']?.return?.toFixed(2),
        return_5y: returns['5Y']?.return?.toFixed(2),
      }
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
