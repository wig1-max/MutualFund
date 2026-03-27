import { Router } from 'express'
import { getDb } from '../db/index.js'
import { parseCasText, enrichWithSchemeCodes } from '../services/casParser.js'

const router = Router()

// POST /api/cas/:clientId/parse — parse CAS text and return preview
router.post('/cas/:clientId/parse', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const { cas_text } = req.body
  if (!cas_text || cas_text.trim().length === 0) {
    return res.status(400).json({ message: 'cas_text is required' })
  }

  const parsed = parseCasText(cas_text)
  const enriched = enrichWithSchemeCodes(parsed.folios, db)

  res.json({
    pan: parsed.pan,
    folios: enriched,
    parsed_count: parsed.parsed_count,
    raw_lines: parsed.raw_lines,
    matched_count: enriched.filter(f => f.scheme_code).length,
  })
})

// POST /api/cas/:clientId/import — save parsed folios to cas_holdings
router.post('/cas/:clientId/import', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const { folios, replace_existing } = req.body
  if (!folios || !Array.isArray(folios) || folios.length === 0) {
    return res.status(400).json({ message: 'folios array is required' })
  }

  const clientId = Number(req.params.clientId)
  const now = new Date().toISOString()

  const insertMany = db.transaction((items) => {
    if (replace_existing) {
      db.prepare("DELETE FROM cas_holdings WHERE client_id = ? AND source = 'cas_upload'").run(clientId)
    }

    const stmt = db.prepare(`
      INSERT INTO cas_holdings (client_id, folio_number, scheme_code, scheme_name, amc, isin, units, nav, current_value, cost_value, purchase_date, source, fetched_at)
      VALUES (@client_id, @folio_number, @scheme_code, @scheme_name, @amc, @isin, @units, @nav, @current_value, @cost_value, @purchase_date, @source, @fetched_at)
    `)

    for (const f of items) {
      stmt.run({
        client_id: clientId,
        folio_number: f.folio_number || null,
        scheme_code: f.scheme_code || null,
        scheme_name: f.scheme_name || null,
        amc: f.amc || null,
        isin: f.isin || null,
        units: f.units || 0,
        nav: f.nav || 0,
        current_value: f.current_value || 0,
        cost_value: f.cost_value || 0,
        purchase_date: f.purchase_date || null,
        source: 'cas_upload',
        fetched_at: now,
      })
    }

    return items.length
  })

  const imported_count = insertMany(folios)

  res.status(201).json({ message: 'Import complete', imported_count })
})

// GET /api/cas/:clientId — get all CAS holdings with summary
router.get('/cas/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const holdings = db.prepare(
    'SELECT * FROM cas_holdings WHERE client_id = ? ORDER BY amc, scheme_name'
  ).all(req.params.clientId)

  const total_current_value = holdings.reduce((s, h) => s + (h.current_value || 0), 0)
  const total_cost_value = holdings.reduce((s, h) => s + (h.cost_value || 0), 0)
  const total_gain = total_current_value - total_cost_value
  const total_gain_pct = total_cost_value > 0 ? (total_gain / total_cost_value) * 100 : 0

  res.json({
    client,
    holdings,
    summary: {
      total_holdings: holdings.length,
      total_current_value: Math.round(total_current_value * 100) / 100,
      total_cost_value: Math.round(total_cost_value * 100) / 100,
      total_gain: Math.round(total_gain * 100) / 100,
      total_gain_pct: Math.round(total_gain_pct * 100) / 100,
    },
  })
})

// DELETE /api/cas/:clientId — clear all CAS holdings
router.delete('/cas/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const result = db.prepare('DELETE FROM cas_holdings WHERE client_id = ?').run(req.params.clientId)
  res.json({ message: 'CAS holdings cleared', deleted_count: result.changes })
})

// POST /api/cas/:clientId/fetch-live — placeholder for MF Central API
router.post('/cas/:clientId/fetch-live', (req, res) => {
  res.status(501).json({
    message: 'MF Central API integration is pending registration.',
    instructions: [
      'Visit https://www.camsonline.com to generate your CAS statement.',
      'Select "Consolidated Account Statement" under Investor Services.',
      'Choose "Detailed" statement type with "All" mutual fund folios.',
      'Select the period and submit — the PDF will be emailed to your registered email.',
      'Copy the text from the PDF and use the /cas/:clientId/parse endpoint to import holdings.',
    ],
  })
})

export default router
