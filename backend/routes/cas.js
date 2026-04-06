import { Router } from 'express'
import { getDb } from '../db/index.js'
import { parseCasText, enrichWithSchemeCodes, enrichTransactionsWithSchemeCodes } from '../services/casParser.js'

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
  const enrichedFolios = enrichWithSchemeCodes(parsed.folios, db)
  const enrichedTxns = enrichTransactionsWithSchemeCodes(parsed.transactions, db)

  res.json({
    pan: parsed.pan,
    folios: enrichedFolios,
    transactions: enrichedTxns,
    parsed_count: parsed.parsed_count,
    transaction_count: parsed.transaction_count,
    raw_lines: parsed.raw_lines,
    matched_count: enrichedFolios.filter(f => f.scheme_code).length,
    matched_txn_count: enrichedTxns.filter(t => t.scheme_code).length,
  })
})

// POST /api/cas/:clientId/import — save parsed folios and transactions
router.post('/cas/:clientId/import', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const { folios, transactions, replace_existing } = req.body
  if ((!folios || !Array.isArray(folios) || folios.length === 0) &&
      (!transactions || !Array.isArray(transactions) || transactions.length === 0)) {
    return res.status(400).json({ message: 'folios or transactions array is required' })
  }

  const clientId = Number(req.params.clientId)
  const now = new Date().toISOString()

  const result = db.transaction(() => {
    let imported_holdings = 0
    let imported_transactions = 0

    if (folios && folios.length > 0) {
      if (replace_existing) {
        db.prepare("DELETE FROM cas_holdings WHERE client_id = ? AND source = 'cas_upload'").run(clientId)
      }

      const holdingStmt = db.prepare(`
        INSERT INTO cas_holdings (client_id, folio_number, scheme_code, scheme_name, amc, isin, units, nav, current_value, cost_value, purchase_date, source, fetched_at)
        VALUES (@client_id, @folio_number, @scheme_code, @scheme_name, @amc, @isin, @units, @nav, @current_value, @cost_value, @purchase_date, @source, @fetched_at)
      `)

      for (const f of folios) {
        holdingStmt.run({
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
      imported_holdings = folios.length
    }

    if (transactions && transactions.length > 0) {
      if (replace_existing) {
        db.prepare("DELETE FROM cas_transactions WHERE client_id = ? AND source = 'cas_upload'").run(clientId)
      }

      const txnStmt = db.prepare(`
        INSERT INTO cas_transactions (client_id, folio_number, scheme_code, scheme_name, amc, isin, transaction_type, transaction_date, amount, units, nav, description, source)
        VALUES (@client_id, @folio_number, @scheme_code, @scheme_name, @amc, @isin, @transaction_type, @transaction_date, @amount, @units, @nav, @description, @source)
      `)

      for (const t of transactions) {
        txnStmt.run({
          client_id: clientId,
          folio_number: t.folio_number || null,
          scheme_code: t.scheme_code || null,
          scheme_name: t.scheme_name || null,
          amc: t.amc || null,
          isin: t.isin || null,
          transaction_type: t.transaction_type || 'other',
          transaction_date: t.transaction_date || null,
          amount: t.amount || 0,
          units: t.units || 0,
          nav: t.nav || 0,
          description: t.description || null,
          source: 'cas_upload',
        })
      }
      imported_transactions = transactions.length
    }

    return { imported_holdings, imported_transactions }
  })()

  res.status(201).json({
    message: 'Import complete',
    imported_count: result.imported_holdings,
    imported_transactions: result.imported_transactions,
  })
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

// GET /api/cas/:clientId/transactions — get CAS transaction history
router.get('/cas/:clientId/transactions', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const { folio, type } = req.query
  let sql = 'SELECT * FROM cas_transactions WHERE client_id = ?'
  const params = [req.params.clientId]

  if (folio) {
    sql += ' AND folio_number = ?'
    params.push(folio)
  }
  if (type) {
    sql += ' AND transaction_type = ?'
    params.push(type)
  }

  sql += ' ORDER BY transaction_date DESC, id DESC'

  const transactions = db.prepare(sql).all(...params)

  // Summary by type
  const summary = {}
  for (const t of transactions) {
    if (!summary[t.transaction_type]) {
      summary[t.transaction_type] = { count: 0, total_amount: 0 }
    }
    summary[t.transaction_type].count++
    summary[t.transaction_type].total_amount += t.amount || 0
  }

  res.json({
    client,
    transactions,
    total_transactions: transactions.length,
    summary,
  })
})

// DELETE /api/cas/:clientId — clear all CAS holdings and transactions
router.delete('/cas/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const clientId = req.params.clientId
  const holdingsResult = db.prepare('DELETE FROM cas_holdings WHERE client_id = ?').run(clientId)
  const txnResult = db.prepare('DELETE FROM cas_transactions WHERE client_id = ?').run(clientId)

  res.json({
    message: 'CAS data cleared',
    deleted_count: holdingsResult.changes,
    deleted_transactions: txnResult.changes,
  })
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
