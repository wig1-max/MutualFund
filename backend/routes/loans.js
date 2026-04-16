// Client loans / liabilities CRUD
//
// Loans are stored in `client_loans` (see migration 002). The aggregate EMI
// of all recorded loans feeds into the risk profiler's capacity calculation
// (profileAnalyzer.js reads monthly EMI from here instead of the legacy
// `current_emi` column on client_profiles).

import { Router } from 'express'
import { getDb } from '../db/index.js'

const router = Router()

const VALID_LOAN_TYPES = new Set([
  'home', 'car', 'personal', 'education', 'business', 'gold', 'other',
])

function isValidLoanType(t) {
  return t && VALID_LOAN_TYPES.has(t)
}

// GET /api/loans/types — list valid loan types
router.get('/loans/types', (req, res) => {
  const labels = {
    home:      'Home Loan',
    car:       'Vehicle Loan',
    personal:  'Personal Loan',
    education: 'Education Loan',
    business:  'Business Loan',
    gold:      'Gold Loan',
    other:     'Other',
  }
  res.json({
    types: [...VALID_LOAN_TYPES].map(v => ({ value: v, label: labels[v] })),
  })
})

// GET /api/loans/:clientId — list all loans for a client
router.get('/loans/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const loans = db.prepare(
    'SELECT * FROM client_loans WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.clientId)

  const totalEmi         = loans.reduce((s, l) => s + (l.emi_amount || 0), 0)
  const totalOutstanding = loans.reduce((s, l) => s + (l.outstanding_amount || 0), 0)

  res.json({
    client,
    loans,
    summary: {
      count:              loans.length,
      total_emi:          totalEmi,
      total_outstanding:  totalOutstanding,
    },
  })
})

// POST /api/loans/:clientId — add a loan
router.post('/loans/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const {
    loan_type, lender,
    principal_amount, outstanding_amount, emi_amount,
    interest_rate, tenure_months, remaining_months,
    start_date, end_date, notes,
  } = req.body

  if (!isValidLoanType(loan_type)) {
    return res.status(400).json({
      message: `Invalid loan_type. Valid: ${[...VALID_LOAN_TYPES].join(', ')}`,
    })
  }
  if (emi_amount == null || isNaN(Number(emi_amount)) || Number(emi_amount) < 0) {
    return res.status(400).json({ message: 'emi_amount is required and must be a non-negative number' })
  }

  const result = db.prepare(`
    INSERT INTO client_loans (
      client_id, loan_type, lender,
      principal_amount, outstanding_amount, emi_amount,
      interest_rate, tenure_months, remaining_months,
      start_date, end_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clientId,
    loan_type, lender || null,
    principal_amount || null, outstanding_amount || null, Number(emi_amount),
    interest_rate || null, tenure_months || null, remaining_months || null,
    start_date || null, end_date || null, notes || null
  )

  const created = db.prepare('SELECT * FROM client_loans WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(created)
})

// PUT /api/loans/:clientId/:loanId — update a loan
router.put('/loans/:clientId/:loanId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT * FROM client_loans WHERE id = ? AND client_id = ?'
  ).get(req.params.loanId, req.params.clientId)
  if (!existing) return res.status(404).json({ message: 'Loan not found' })

  const {
    loan_type, lender,
    principal_amount, outstanding_amount, emi_amount,
    interest_rate, tenure_months, remaining_months,
    start_date, end_date, notes,
  } = req.body

  if (loan_type != null && !isValidLoanType(loan_type)) {
    return res.status(400).json({ message: 'Invalid loan_type' })
  }

  db.prepare(`
    UPDATE client_loans SET
      loan_type          = COALESCE(?, loan_type),
      lender             = COALESCE(?, lender),
      principal_amount   = COALESCE(?, principal_amount),
      outstanding_amount = ?,
      emi_amount         = COALESCE(?, emi_amount),
      interest_rate      = ?,
      tenure_months      = ?,
      remaining_months   = ?,
      start_date         = COALESCE(?, start_date),
      end_date           = ?,
      notes              = ?,
      updated_at         = datetime('now')
    WHERE id = ? AND client_id = ?
  `).run(
    loan_type || null, lender ?? null,
    principal_amount ?? null,
    outstanding_amount ?? existing.outstanding_amount,
    emi_amount != null ? Number(emi_amount) : null,
    interest_rate ?? existing.interest_rate,
    tenure_months ?? existing.tenure_months,
    remaining_months ?? existing.remaining_months,
    start_date || null,
    end_date ?? existing.end_date,
    notes ?? existing.notes,
    req.params.loanId, req.params.clientId
  )

  const updated = db.prepare('SELECT * FROM client_loans WHERE id = ?').get(req.params.loanId)
  res.json(updated)
})

// DELETE /api/loans/:clientId/:loanId — delete a loan
router.delete('/loans/:clientId/:loanId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT id FROM client_loans WHERE id = ? AND client_id = ?'
  ).get(req.params.loanId, req.params.clientId)
  if (!existing) return res.status(404).json({ message: 'Loan not found' })

  db.prepare('DELETE FROM client_loans WHERE id = ?').run(req.params.loanId)
  res.json({ success: true })
})

export default router
