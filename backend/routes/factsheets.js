import { Router } from 'express'
import { getDb } from '../db/index.js'
import {
  runFactsheetPipeline,
  updateMetricsFromFactsheets,
} from '../services/factsheetPipeline.js'
import { getAmcList, getCurrentFactsheetMonth } from '../services/amcRegistry.js'

const router = Router()

// POST /factsheets/run-pipeline — Trigger full pipeline
router.post('/factsheets/run-pipeline', (req, res) => {
  const { month, forceRefetch } = req.body || {}
  const targetMonth = month || getCurrentFactsheetMonth().yyyymm

  res.json({
    message: `Factsheet pipeline started for ${targetMonth}`,
    month: targetMonth,
  })

  // Run in background
  setImmediate(async () => {
    try {
      await runFactsheetPipeline(targetMonth, { forceRefetch: !!forceRefetch })
    } catch (e) {
      console.error('[FactsheetRoute] Pipeline failed:', e.message)
    }
  })
})

// GET /factsheets/status — Pipeline status
router.get('/factsheets/status', (req, res) => {
  try {
    const db = getDb()
    const { yyyymm } = getCurrentFactsheetMonth()
    const month = req.query.month || yyyymm

    const sources = db.prepare(
      'SELECT * FROM amc_factsheet_sources ORDER BY amc_name'
    ).all()

    const byStatus = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN last_fetch_status = 'extracted' THEN 1 ELSE 0 END) as extracted,
        SUM(CASE WHEN last_fetch_status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN last_fetch_status IS NULL THEN 1 ELSE 0 END) as pending
      FROM amc_factsheet_sources
    `).get()

    const totalFunds = db.prepare(
      'SELECT COUNT(*) as c FROM fund_factsheets WHERE factsheet_month = ?'
    ).get(month)?.c || 0

    const matchedFunds = db.prepare(
      'SELECT COUNT(*) as c FROM fund_factsheets WHERE factsheet_month = ? AND scheme_code IS NOT NULL'
    ).get(month)?.c || 0

    res.json({
      month,
      amcs: {
        total: sources.length,
        extracted: byStatus?.extracted || 0,
        failed: byStatus?.failed || 0,
        pending: byStatus?.pending || 0,
      },
      funds: {
        total: totalFunds,
        matched: matchedFunds,
        unmatched: totalFunds - matchedFunds,
      },
      sources,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /factsheets/fund/:schemeCode — Per-fund factsheet data
router.get('/factsheets/fund/:schemeCode', (req, res) => {
  try {
    const db = getDb()
    const { schemeCode } = req.params

    const latest = db.prepare(`
      SELECT * FROM fund_factsheets
      WHERE scheme_code = ?
      ORDER BY factsheet_month DESC
      LIMIT 1
    `).get(schemeCode)

    const history = db.prepare(`
      SELECT factsheet_month, expense_ratio, aum_cr, portfolio_pe, portfolio_pb
      FROM fund_factsheets
      WHERE scheme_code = ?
      ORDER BY factsheet_month DESC
    `).all(schemeCode)

    if (!latest) {
      return res.status(404).json({ error: 'No factsheet data for this fund' })
    }

    // Parse JSON fields
    if (latest.top_holdings) {
      try { latest.top_holdings = JSON.parse(latest.top_holdings) } catch {}
    }
    if (latest.sector_allocation) {
      try { latest.sector_allocation = JSON.parse(latest.sector_allocation) } catch {}
    }

    res.json({ latest, history })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /factsheets/unmatched — Funds not yet matched to scheme_codes
router.get('/factsheets/unmatched', (req, res) => {
  try {
    const db = getDb()
    const unmatched = db.prepare(`
      SELECT id, amc, fund_name_raw, factsheet_month, expense_ratio, aum_cr
      FROM fund_factsheets
      WHERE scheme_code IS NULL
      ORDER BY amc, fund_name_raw
    `).all()

    res.json({ count: unmatched.length, funds: unmatched })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /factsheets/match — Manually match a factsheet fund to a scheme_code
router.post('/factsheets/match', (req, res) => {
  try {
    const db = getDb()
    const { factsheetId, schemeCode } = req.body

    if (!factsheetId || !schemeCode) {
      return res.status(400).json({ error: 'factsheetId and schemeCode required' })
    }

    // Update factsheet record
    db.prepare(
      'UPDATE fund_factsheets SET scheme_code = ? WHERE id = ?'
    ).run(schemeCode, factsheetId)

    // Propagate to fund_metrics
    const fs = db.prepare(
      'SELECT expense_ratio, aum_cr, manager_tenure_years, portfolio_pe FROM fund_factsheets WHERE id = ?'
    ).get(factsheetId)

    if (fs) {
      db.prepare(`
        UPDATE fund_metrics SET
          expense_ratio = COALESCE(?, expense_ratio),
          aum_cr = COALESCE(?, aum_cr),
          manager_tenure_years = COALESCE(?, manager_tenure_years),
          portfolio_pe = COALESCE(?, portfolio_pe)
        WHERE scheme_code = ?
      `).run(fs.expense_ratio, fs.aum_cr, fs.manager_tenure_years, fs.portfolio_pe, schemeCode)
    }

    res.json({ success: true, schemeCode, factsheetId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /factsheets/refresh-metrics — Re-propagate factsheet data to fund_metrics
router.post('/factsheets/refresh-metrics', (req, res) => {
  try {
    const updated = updateMetricsFromFactsheets()
    res.json({ success: true, updated })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
