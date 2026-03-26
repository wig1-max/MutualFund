import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

// Helper: calculate next review date from a base date and frequency
function calcNextReview(baseDate, frequency) {
  const d = new Date(baseDate || Date.now())
  switch (frequency) {
    case 'Monthly': d.setMonth(d.getMonth() + 1); break
    case 'Quarterly': d.setMonth(d.getMonth() + 3); break
    case 'Half-yearly': d.setMonth(d.getMonth() + 6); break
    case 'Annual': d.setFullYear(d.getFullYear() + 1); break
    default: d.setMonth(d.getMonth() + 3)
  }
  return d.toISOString().split('T')[0]
}

// Helper: mask PAN — store only last 4 chars visible
function maskPan(pan) {
  if (!pan) return ''
  const clean = pan.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length < 4) return clean
  return 'XXXXXX' + clean.slice(-4)
}

// GET /api/clients — list all clients with optional filters
router.get('/clients', (req, res) => {
  const db = getDb()
  const { search, tag, risk_profile, review_due } = req.query

  let sql = 'SELECT * FROM clients WHERE 1=1'
  const params = []

  if (search) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)'
    const q = `%${search}%`
    params.push(q, q, q)
  }

  if (tag) {
    sql += ' AND tags LIKE ?'
    params.push(`%"${tag}"%`)
  }

  if (risk_profile) {
    sql += ' AND risk_profile = ?'
    params.push(risk_profile)
  }

  if (review_due === 'true') {
    sql += ' AND next_review_date <= date("now", "+7 days")'
  }

  sql += ' ORDER BY name ASC'

  const clients = db.prepare(sql).all(...params)
  // Parse tags from JSON string
  res.json(clients.map(c => ({ ...c, tags: JSON.parse(c.tags || '[]') })))
})

// GET /api/clients/stats — dashboard stats
router.get('/clients/stats', (req, res) => {
  const db = getDb()

  const total = db.prepare('SELECT COUNT(*) as count FROM clients').get().count
  const reviewsDue = db.prepare(
    'SELECT COUNT(*) as count FROM clients WHERE next_review_date <= date("now", "+7 days")'
  ).get().count
  const byRisk = db.prepare(
    'SELECT risk_profile, COUNT(*) as count FROM clients GROUP BY risk_profile'
  ).all()
  const byTag = db.prepare('SELECT tags FROM clients').all()

  // Count tag frequency
  const tagCounts = {}
  for (const row of byTag) {
    const tags = JSON.parse(row.tags || '[]')
    for (const t of tags) {
      tagCounts[t] = (tagCounts[t] || 0) + 1
    }
  }

  const recentClients = db.prepare(
    'SELECT id, name, onboarding_date, risk_profile FROM clients ORDER BY created_at DESC LIMIT 5'
  ).all()

  const upcomingReviews = db.prepare(
    'SELECT id, name, next_review_date, review_frequency FROM clients WHERE next_review_date IS NOT NULL ORDER BY next_review_date ASC LIMIT 10'
  ).all()

  res.json({
    totalClients: total,
    reviewsDueThisWeek: reviewsDue,
    byRiskProfile: byRisk,
    tagCounts,
    recentClients,
    upcomingReviews,
  })
})

// GET /api/clients/:id — single client detail
router.get('/clients/:id', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const notes = db.prepare(
    'SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.id)

  res.json({
    ...client,
    tags: JSON.parse(client.tags || '[]'),
    notes,
  })
})

// POST /api/clients — create new client
router.post('/clients', (req, res) => {
  const db = getDb()
  const { name, phone, email, pan, risk_profile, onboarding_date, referred_by, tags, review_frequency } = req.body

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: 'Client name is required' })
  }

  const freq = review_frequency || 'Quarterly'
  const nextReview = calcNextReview(onboarding_date || new Date().toISOString().split('T')[0], freq)

  const result = db.prepare(`
    INSERT INTO clients (name, phone, email, pan_masked, risk_profile, onboarding_date, referred_by, tags, review_frequency, next_review_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    phone || '',
    email || '',
    maskPan(pan || ''),
    risk_profile || 'Moderate',
    onboarding_date || new Date().toISOString().split('T')[0],
    referred_by || '',
    JSON.stringify(tags || []),
    freq,
    nextReview
  )

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({ ...client, tags: JSON.parse(client.tags || '[]') })
})

// PUT /api/clients/:id — update client
router.put('/clients/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ message: 'Client not found' })

  const { name, phone, email, pan, risk_profile, onboarding_date, referred_by, tags, review_frequency } = req.body

  const freq = review_frequency || existing.review_frequency
  // Only recalculate next_review_date if review_frequency actually changed
  const nextReview = (review_frequency && review_frequency !== existing.review_frequency)
    ? calcNextReview(new Date().toISOString().split('T')[0], freq)
    : existing.next_review_date

  db.prepare(`
    UPDATE clients SET
      name = ?, phone = ?, email = ?, pan_masked = ?,
      risk_profile = ?, onboarding_date = ?, referred_by = ?,
      tags = ?, review_frequency = ?, next_review_date = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    (name || existing.name).trim(),
    phone ?? existing.phone,
    email ?? existing.email,
    pan ? maskPan(pan) : existing.pan_masked,
    risk_profile || existing.risk_profile,
    onboarding_date || existing.onboarding_date,
    referred_by ?? existing.referred_by,
    JSON.stringify(tags || JSON.parse(existing.tags || '[]')),
    freq,
    nextReview,
    req.params.id
  )

  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  res.json({ ...updated, tags: JSON.parse(updated.tags || '[]') })
})

// DELETE /api/clients/:id — delete client
router.delete('/clients/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ message: 'Client not found' })

  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id)
  res.json({ message: 'Client deleted' })
})

// POST /api/clients/:id/notes — add note
router.post('/clients/:id/notes', (req, res) => {
  const db = getDb()
  const { note } = req.body
  if (!note || note.trim().length === 0) {
    return res.status(400).json({ message: 'Note text is required' })
  }

  const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ message: 'Client not found' })

  const result = db.prepare(
    'INSERT INTO client_notes (client_id, note) VALUES (?, ?)'
  ).run(req.params.id, note.trim())

  // Update notes count
  db.prepare(
    'UPDATE clients SET notes_count = (SELECT COUNT(*) FROM client_notes WHERE client_id = ?), updated_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id, req.params.id)

  const created = db.prepare('SELECT * FROM client_notes WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(created)
})

// DELETE /api/clients/:id/notes/:noteId — delete note
router.delete('/clients/:id/notes/:noteId', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM client_notes WHERE id = ? AND client_id = ?').run(req.params.noteId, req.params.id)

  // Update notes count
  db.prepare(
    'UPDATE clients SET notes_count = (SELECT COUNT(*) FROM client_notes WHERE client_id = ?), updated_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id, req.params.id)

  res.json({ message: 'Note deleted' })
})

// POST /api/clients/:id/complete-review — mark review as done, schedule next
router.post('/clients/:id/complete-review', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const nextReview = calcNextReview(new Date().toISOString().split('T')[0], client.review_frequency)

  db.prepare(
    'UPDATE clients SET next_review_date = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(nextReview, req.params.id)

  // Auto-add a note about the review
  db.prepare(
    'INSERT INTO client_notes (client_id, note) VALUES (?, ?)'
  ).run(req.params.id, `Review completed. Next review scheduled for ${nextReview}.`)

  db.prepare(
    'UPDATE clients SET notes_count = (SELECT COUNT(*) FROM client_notes WHERE client_id = ?), updated_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id, req.params.id)

  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  res.json({ ...updated, tags: JSON.parse(updated.tags || '[]'), nextReview })
})

export default router
