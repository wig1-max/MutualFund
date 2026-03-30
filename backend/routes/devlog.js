import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

router.get('/dev/status', (req, res) => {
  try {
    const db = getDb()

    // Database counts
    const total_funds = db.prepare('SELECT COUNT(*) as c FROM funds').get().c
    const funds_with_nav = db.prepare('SELECT COUNT(*) as c FROM funds WHERE nav > 0').get().c
    const nav_cache_scheme_count = db.prepare('SELECT COUNT(DISTINCT scheme_code) as c FROM nav_cache').get().c
    const nav_cache_total_rows = db.prepare('SELECT COUNT(*) as c FROM nav_cache').get().c
    const total_clients = db.prepare('SELECT COUNT(*) as c FROM clients').get().c
    const total_holdings = db.prepare('SELECT COUNT(*) as c FROM client_holdings').get().c
    const total_cas_holdings = db.prepare('SELECT COUNT(*) as c FROM cas_holdings').get().c

    // Metrics
    const total_computed = db.prepare('SELECT COUNT(*) as c FROM fund_metrics').get().c
    const with_sortino = db.prepare('SELECT COUNT(*) as c FROM fund_metrics WHERE sortino_ratio IS NOT NULL').get().c
    const with_calmar = db.prepare('SELECT COUNT(*) as c FROM fund_metrics WHERE calmar_ratio IS NOT NULL').get().c
    const with_return_3y = db.prepare('SELECT COUNT(*) as c FROM fund_metrics WHERE return_3y IS NOT NULL').get().c
    const with_risk_level = db.prepare('SELECT COUNT(*) as c FROM fund_metrics WHERE risk_level IS NOT NULL').get().c
    const corrupt_risk_level_count = db.prepare(
      "SELECT COUNT(*) as c FROM fund_metrics WHERE risk_level IS NOT NULL AND risk_level NOT IN ('very_low','low','low_moderate','moderate','moderate_high','high','very_high')"
    ).get().c
    const coverage_pct = funds_with_nav > 0
      ? Math.round(total_computed / funds_with_nav * 1000) / 10
      : 0
    const sample_risk_levels = db.prepare(
      'SELECT risk_level, COUNT(*) as count FROM fund_metrics WHERE risk_level IS NOT NULL GROUP BY risk_level ORDER BY count DESC LIMIT 10'
    ).all()

    // Recommendations
    const total_stored = db.prepare('SELECT COUNT(*) as c FROM fund_recommendations').get().c
    const with_zero_category_fit = db.prepare('SELECT COUNT(*) as c FROM fund_recommendations WHERE category_fit_score = 0').get().c
    const clients_scored = db.prepare('SELECT COUNT(DISTINCT client_id) as c FROM fund_recommendations').get().c

    // Factsheets
    const total_extracted = db.prepare('SELECT COUNT(*) as c FROM fund_factsheets').get().c
    const matched_to_scheme = db.prepare('SELECT COUNT(*) as c FROM fund_factsheets WHERE scheme_code IS NOT NULL').get().c
    const amc_sources_total = db.prepare('SELECT COUNT(*) as c FROM amc_factsheet_sources').get().c
    const amc_sources_extracted = db.prepare("SELECT COUNT(*) as c FROM amc_factsheet_sources WHERE last_fetch_status = 'extracted'").get().c
    const amc_sources_failed = db.prepare("SELECT COUNT(*) as c FROM amc_factsheet_sources WHERE last_fetch_status = 'failed'").get().c

    // Profiles
    const profiles_total = db.prepare('SELECT COUNT(*) as c FROM client_profiles').get().c
    const profiles_complete = db.prepare('SELECT COUNT(*) as c FROM client_profiles WHERE profile_complete = 1').get().c
    const profiles_sample = db.prepare(
      'SELECT client_id, risk_label, risk_capacity_score, profile_complete FROM client_profiles ORDER BY created_at DESC LIMIT 5'
    ).all()

    res.json({
      timestamp: new Date().toISOString(),
      database: {
        total_funds,
        funds_with_nav,
        nav_cache_scheme_count,
        nav_cache_total_rows,
        total_clients,
        total_holdings,
        total_cas_holdings,
      },
      metrics: {
        total_computed,
        with_sortino,
        with_calmar,
        with_return_3y,
        with_risk_level,
        corrupt_risk_level_count,
        coverage_pct,
        sample_risk_levels,
      },
      recommendations: {
        total_stored,
        with_zero_category_fit,
        clients_scored,
      },
      factsheets: {
        total_extracted,
        matched_to_scheme,
        amc_sources_total,
        amc_sources_extracted,
        amc_sources_failed,
      },
      profiles: {
        total: profiles_total,
        complete: profiles_complete,
        sample: profiles_sample,
      },
    })
  } catch (err) {
    console.error('[DevLog] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
