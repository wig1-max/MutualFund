import { Router } from 'express'
import { getDb } from '../db/index.js'
import { scoreClientFunds, storeFundMetrics } from '../services/scoringEngine.js'
import { fetchNavHistory } from '../services/mfapi.js'
import { calculateReturns, standardDeviation, maxDrawdown,
         sharpeRatio, sortinoRatio, calmarRatio,
         jensensAlpha, fundAgeYears } from '../services/calculations.js'
import { getCategoryRiskLevel, getBenchmarkSchemeCode } from '../utils/fundClassification.js'

const router = Router()

// GET /api/scoring/metrics/status — check metrics job progress
router.get('/scoring/metrics/status', (req, res) => {
  const db = getDb()

  const total = db.prepare(
    'SELECT COUNT(*) as c FROM funds WHERE nav > 0'
  ).get().c

  const withMetrics = db.prepare(
    'SELECT COUNT(*) as c FROM fund_metrics'
  ).get().c

  const withSortino = db.prepare(
    'SELECT COUNT(*) as c FROM fund_metrics ' +
    'WHERE sortino_ratio IS NOT NULL'
  ).get().c

  const withReturn3y = db.prepare(
    'SELECT COUNT(*) as c FROM fund_metrics ' +
    'WHERE return_3y IS NOT NULL'
  ).get().c

  const navCacheCoverage = db.prepare(`
    SELECT COUNT(DISTINCT scheme_code) as c
    FROM nav_cache
  `).get().c

  const topFunds = db.prepare(`
    SELECT fm.scheme_code, f.scheme_name, f.scheme_category,
           fm.sortino_ratio, fm.calmar_ratio, fm.return_3y,
           fm.data_quality_score, fm.nav_data_points
    FROM fund_metrics fm
    JOIN funds f ON f.scheme_code = fm.scheme_code
    WHERE fm.sortino_ratio IS NOT NULL
    ORDER BY fm.sortino_ratio DESC
    LIMIT 10
  `).all()

  res.json({
    funds_in_db: total,
    nav_cache_coverage: navCacheCoverage,
    funds_with_metrics: withMetrics,
    funds_with_sortino: withSortino,
    funds_with_3y_return: withReturn3y,
    coverage_pct: total > 0
      ? Math.round(withMetrics / total * 100) : 0,
    top_10_by_sortino: topFunds,
  })
})

// POST /api/scoring/run-metrics-job — manually trigger metrics job
router.post('/scoring/run-metrics-job', async (req, res) => {
  res.json({
    message: 'Metrics job started in background. Check server logs for progress.',
    note: 'Job processes all funds with 250+ NAV data points.'
  })
  setImmediate(async () => {
    try {
      const { runMetricsJob } = await import('../services/metricsJob.js')
      await runMetricsJob()
    } catch (e) {
      console.error('[MetricsJob] Manual trigger error:', e.message)
    }
  })
})

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

    let benchmarkData = null
    const fundInfoForBenchmark = db.prepare(
      'SELECT scheme_category FROM funds WHERE scheme_code = ?'
    ).get(schemeCode)
    const benchmarkCode = getBenchmarkSchemeCode(
      fundInfoForBenchmark?.scheme_category
    )
    if (benchmarkCode) {
      try {
        const benchResult = await fetchNavHistory(benchmarkCode)
        benchmarkData = benchResult.data
        console.log(
          `[EnrichMetrics] ${schemeCode} category="${fundInfoForBenchmark?.scheme_category}" → benchmark=${benchmarkCode}`
        )
      } catch (e) {
        console.warn(
          `[EnrichMetrics] Benchmark ${benchmarkCode} fetch failed for ${schemeCode}: ${e.message}`
        )
      }
    } else {
      console.log(
        `[EnrichMetrics] No benchmark applicable for ${schemeCode} ` +
        `(category: ${fundInfoForBenchmark?.scheme_category}) — skipping alpha`
      )
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
