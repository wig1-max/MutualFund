import { Router } from 'express'
import { getDb } from '../db/index.js'
import { upsertProfile } from '../services/profileAnalyzer.js'

const router = Router()

// GET /api/profiling/summary/all — aggregate profiling stats
router.get('/profiling/summary/all', (req, res) => {
  const db = getDb()

  const total_clients = db.prepare('SELECT COUNT(*) as c FROM clients').get().c
  const profiled_clients = db.prepare('SELECT COUNT(*) as c FROM client_profiles WHERE profile_complete = 1').get().c
  const profile_completion_pct = total_clients > 0
    ? Math.round((profiled_clients / total_clients) * 100 * 10) / 10
    : 0

  const by_risk_label = db.prepare(
    'SELECT risk_label, COUNT(*) as count FROM client_profiles GROUP BY risk_label ORDER BY count DESC'
  ).all()

  const avg_row = db.prepare(
    'SELECT AVG(investable_surplus) as avg FROM client_profiles WHERE profile_complete = 1'
  ).get()
  const avg_investable_surplus = Math.round((avg_row.avg || 0) * 100) / 100

  res.json({ total_clients, profiled_clients, profile_completion_pct, by_risk_label, avg_investable_surplus })
})

// GET /api/profiling/:clientId — get client with profile
router.get('/profiling/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const profile = db.prepare('SELECT * FROM client_profiles WHERE client_id = ?').get(req.params.clientId)
  if (profile && profile.questionnaire_responses) {
    try { profile.questionnaire_responses = JSON.parse(profile.questionnaire_responses) } catch {}
  }

  res.json({ client, profile: profile || null })
})

// POST /api/profiling/:clientId — create or update profile
router.post('/profiling/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const profile = upsertProfile(Number(req.params.clientId), req.body)
  if (profile && profile.questionnaire_responses) {
    try { profile.questionnaire_responses = JSON.parse(profile.questionnaire_responses) } catch {}
  }

  res.json({ client, profile })
})

export default router
