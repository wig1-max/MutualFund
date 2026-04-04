import { Router } from 'express'
import { getDb } from '../db/index.js'
import { isValidAssetType, isValidSubtype, ASSET_TYPES, ASSET_SUBTYPES } from '../utils/assetClassification.js'
import { estimateCurrentValue } from '../services/assetValuation.js'

const router = Router()

// GET /api/assets/types — list valid asset types and subtypes
router.get('/assets/types', (req, res) => {
  const types = Object.entries(ASSET_TYPES).map(([key, val]) => ({
    value: key,
    label: val.label,
    subtypes: ASSET_SUBTYPES[key] || [],
  }))
  res.json({ types })
})

// GET /api/assets/:clientId — list all non-MF assets for a client
router.get('/assets/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const { asset_type } = req.query
  let sql = 'SELECT * FROM household_assets WHERE client_id = ?'
  const params = [req.params.clientId]

  if (asset_type) {
    sql += ' AND asset_type = ?'
    params.push(asset_type)
  }

  sql += ' ORDER BY created_at DESC'
  const assets = db.prepare(sql).all(...params)

  // Enrich with estimated current values
  const enriched = assets.map(a => ({
    ...a,
    estimated_value: estimateCurrentValue(a),
    metadata: safeParseJson(a.metadata),
  }))

  res.json({ client, assets: enriched })
})

// POST /api/assets/:clientId — add a new asset
router.post('/assets/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const {
    asset_type, asset_subtype, name, identifier,
    invested_amount, current_value, units,
    purchase_date, maturity_date, interest_rate,
    metadata, notes,
  } = req.body

  if (!asset_type || !name) {
    return res.status(400).json({ message: 'asset_type and name are required' })
  }
  if (!isValidAssetType(asset_type)) {
    return res.status(400).json({ message: `Invalid asset_type. Valid types: ${Object.keys(ASSET_TYPES).join(', ')}` })
  }
  if (!isValidSubtype(asset_type, asset_subtype)) {
    return res.status(400).json({ message: `Invalid subtype for ${asset_type}. Valid: ${(ASSET_SUBTYPES[asset_type] || []).join(', ')}` })
  }

  const result = db.prepare(`
    INSERT INTO household_assets (
      client_id, asset_type, asset_subtype, name, identifier,
      invested_amount, current_value, units,
      purchase_date, maturity_date, interest_rate,
      metadata, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clientId,
    asset_type, asset_subtype || null, name, identifier || null,
    invested_amount || 0, current_value || null, units || null,
    purchase_date || null, maturity_date || null, interest_rate || null,
    JSON.stringify(metadata || {}), notes || null
  )

  const created = db.prepare('SELECT * FROM household_assets WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({
    ...created,
    estimated_value: estimateCurrentValue(created),
    metadata: safeParseJson(created.metadata),
  })
})

// PUT /api/assets/:clientId/:assetId — update an asset
router.put('/assets/:clientId/:assetId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT * FROM household_assets WHERE id = ? AND client_id = ?'
  ).get(req.params.assetId, req.params.clientId)

  if (!existing) return res.status(404).json({ message: 'Asset not found' })

  const {
    asset_type, asset_subtype, name, identifier,
    invested_amount, current_value, units,
    purchase_date, maturity_date, interest_rate,
    metadata, notes,
  } = req.body

  if (asset_type && !isValidAssetType(asset_type)) {
    return res.status(400).json({ message: `Invalid asset_type` })
  }

  db.prepare(`
    UPDATE household_assets SET
      asset_type = COALESCE(?, asset_type),
      asset_subtype = COALESCE(?, asset_subtype),
      name = COALESCE(?, name),
      identifier = COALESCE(?, identifier),
      invested_amount = COALESCE(?, invested_amount),
      current_value = ?,
      units = ?,
      purchase_date = COALESCE(?, purchase_date),
      maturity_date = ?,
      interest_rate = ?,
      metadata = COALESCE(?, metadata),
      notes = ?,
      updated_at = datetime('now')
    WHERE id = ? AND client_id = ?
  `).run(
    asset_type || null, asset_subtype, name || null, identifier,
    invested_amount, current_value ?? existing.current_value, units ?? existing.units,
    purchase_date || null, maturity_date ?? existing.maturity_date,
    interest_rate ?? existing.interest_rate,
    metadata ? JSON.stringify(metadata) : null, notes ?? existing.notes,
    req.params.assetId, req.params.clientId
  )

  const updated = db.prepare('SELECT * FROM household_assets WHERE id = ?').get(req.params.assetId)
  res.json({
    ...updated,
    estimated_value: estimateCurrentValue(updated),
    metadata: safeParseJson(updated.metadata),
  })
})

// DELETE /api/assets/:clientId/:assetId — delete an asset
router.delete('/assets/:clientId/:assetId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT id FROM household_assets WHERE id = ? AND client_id = ?'
  ).get(req.params.assetId, req.params.clientId)

  if (!existing) return res.status(404).json({ message: 'Asset not found' })

  db.prepare('DELETE FROM household_assets WHERE id = ?').run(req.params.assetId)
  res.json({ success: true })
})

function safeParseJson(str) {
  if (!str) return {}
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch { return {} }
}

export default router
