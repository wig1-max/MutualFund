import { Router } from 'express'
import { getDb } from '../db/index.js'
import { computeGoalAllocation, getClientWealthForGoals } from '../services/goalAllocationEngine.js'

const router = Router()

// Migrate: add asset_allocation column if it doesn't exist
try {
  const db = getDb()
  const cols = db.pragma('table_info(client_goals)')
  if (!cols.find(c => c.name === 'asset_allocation')) {
    db.exec("ALTER TABLE client_goals ADD COLUMN asset_allocation TEXT DEFAULT NULL")
  }
} catch (_) { /* table may not exist yet — schema.sql handles creation */ }

// SIP calculation helpers

// Future value of a present amount with inflation
function inflationAdjusted(amount, inflationRate, years) {
  return amount * Math.pow(1 + inflationRate / 100, years)
}

// Monthly SIP required to reach a future target
// FV = SIP * [((1+r)^n - 1) / r] * (1+r)  where r = monthly rate, n = months
function requiredMonthlySip(targetAmount, currentSavings, annualReturn, years) {
  if (years <= 0) return targetAmount - currentSavings
  const monthlyRate = annualReturn / 100 / 12
  const months = years * 12

  // Future value of current savings
  const fvCurrent = currentSavings * Math.pow(1 + monthlyRate, months)
  const remaining = targetAmount - fvCurrent
  if (remaining <= 0) return 0

  // SIP needed for remaining amount
  if (monthlyRate === 0) return remaining / months
  const sipFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate * (1 + monthlyRate)
  return remaining / sipFactor
}

// Future value of monthly SIP
function sipFutureValue(monthlySip, annualReturn, years) {
  if (years <= 0 || monthlySip <= 0) return 0
  const monthlyRate = annualReturn / 100 / 12
  const months = years * 12
  if (monthlyRate === 0) return monthlySip * months
  return monthlySip * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
}

// Total corpus from current savings + SIP
function projectedCorpus(currentSavings, monthlySip, annualReturn, years) {
  const monthlyRate = annualReturn / 100 / 12
  const months = years * 12
  const fvSavings = currentSavings * Math.pow(1 + monthlyRate, months)
  const fvSip = sipFutureValue(monthlySip, annualReturn, years)
  return fvSavings + fvSip
}

// GET /api/goals/:clientId — list all goals for a client
router.get('/goals/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const goals = db.prepare(
    'SELECT * FROM client_goals WHERE client_id = ? ORDER BY target_year ASC'
  ).all(req.params.clientId)

  // Enrich each goal with computed fields
  const enriched = goals.map(g => enrichGoal(g))

  res.json({ client, goals: enriched })
})

// POST /api/goals/:clientId — create a new goal
router.post('/goals/:clientId', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const {
    goal_name, goal_type, target_amount, target_year,
    current_savings, expected_return, inflation_rate,
    monthly_sip, priority, notes
  } = req.body

  if (!goal_name || !target_amount || !target_year) {
    return res.status(400).json({ message: 'goal_name, target_amount, and target_year are required' })
  }

  const currentYear = new Date().getFullYear()
  if (target_year <= currentYear) {
    return res.status(400).json({ message: 'target_year must be in the future' })
  }

  const years = target_year - currentYear
  const inflRate = inflation_rate ?? 6
  const retRate = expected_return ?? 12
  const savings = current_savings ?? 0

  // Calculate inflation-adjusted target
  const inflatedTarget = inflationAdjusted(target_amount, inflRate, years)

  // Calculate required SIP if not provided
  const calculatedSip = monthly_sip ?? Math.max(0, Math.ceil(requiredMonthlySip(inflatedTarget, savings, retRate, years)))

  const result = db.prepare(`
    INSERT INTO client_goals (client_id, goal_name, goal_type, target_amount, target_year,
      current_savings, expected_return, inflation_rate, monthly_sip, priority, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.clientId,
    goal_name.trim(),
    goal_type || 'Custom',
    target_amount,
    target_year,
    savings,
    retRate,
    inflRate,
    calculatedSip,
    priority || 'Medium',
    notes || null
  )

  const goal = db.prepare('SELECT * FROM client_goals WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(enrichGoal(goal))
})

// PUT /api/goals/:clientId/:goalId — update a goal
router.put('/goals/:clientId/:goalId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT * FROM client_goals WHERE id = ? AND client_id = ?'
  ).get(req.params.goalId, req.params.clientId)
  if (!existing) return res.status(404).json({ message: 'Goal not found' })

  const {
    goal_name, goal_type, target_amount, target_year,
    current_savings, expected_return, inflation_rate,
    monthly_sip, priority, notes
  } = req.body

  const updatedYear = target_year ?? existing.target_year
  const updatedAmount = target_amount ?? existing.target_amount
  const updatedInflation = inflation_rate ?? existing.inflation_rate
  const updatedReturn = expected_return ?? existing.expected_return
  const updatedSavings = current_savings ?? existing.current_savings

  // Recalculate SIP if user hasn't explicitly provided one
  let updatedSip = monthly_sip
  if (updatedSip == null) {
    const years = updatedYear - new Date().getFullYear()
    const inflatedTarget = inflationAdjusted(updatedAmount, updatedInflation, years)
    updatedSip = Math.max(0, Math.ceil(requiredMonthlySip(inflatedTarget, updatedSavings, updatedReturn, years)))
  }

  db.prepare(`
    UPDATE client_goals SET
      goal_name = ?, goal_type = ?, target_amount = ?, target_year = ?,
      current_savings = ?, expected_return = ?, inflation_rate = ?,
      monthly_sip = ?, priority = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    (goal_name || existing.goal_name).trim(),
    goal_type || existing.goal_type,
    updatedAmount,
    updatedYear,
    updatedSavings,
    updatedReturn,
    updatedInflation,
    updatedSip,
    priority || existing.priority,
    notes !== undefined ? notes : existing.notes,
    req.params.goalId
  )

  const updated = db.prepare('SELECT * FROM client_goals WHERE id = ?').get(req.params.goalId)
  res.json(enrichGoal(updated))
})

// DELETE /api/goals/:clientId/:goalId — delete a goal
router.delete('/goals/:clientId/:goalId', (req, res) => {
  const db = getDb()
  const existing = db.prepare(
    'SELECT * FROM client_goals WHERE id = ? AND client_id = ?'
  ).get(req.params.goalId, req.params.clientId)
  if (!existing) return res.status(404).json({ message: 'Goal not found' })

  db.prepare('DELETE FROM client_goals WHERE id = ?').run(req.params.goalId)
  res.json({ message: 'Goal deleted' })
})

// POST /api/goals/calculate — standalone SIP calculator (no persistence)
router.post('/goals/calculate', (req, res) => {
  const { target_amount, target_year, current_savings, expected_return, inflation_rate } = req.body
  if (!target_amount || !target_year) {
    return res.status(400).json({ message: 'target_amount and target_year are required' })
  }

  const currentYear = new Date().getFullYear()
  const years = target_year - currentYear
  if (years <= 0) return res.status(400).json({ message: 'target_year must be in the future' })

  const inflRate = inflation_rate ?? 6
  const retRate = expected_return ?? 12
  const savings = current_savings ?? 0

  const inflatedTarget = inflationAdjusted(target_amount, inflRate, years)
  const sip = Math.max(0, Math.ceil(requiredMonthlySip(inflatedTarget, savings, retRate, years)))

  // Generate yearly projection
  const yearlyProjection = []
  for (let y = 1; y <= years; y++) {
    const corpus = projectedCorpus(savings, sip, retRate, y)
    const targetAtYear = inflationAdjusted(target_amount, inflRate, y)
    yearlyProjection.push({
      year: currentYear + y,
      corpus: Math.round(corpus),
      target: Math.round(targetAtYear),
      totalInvested: Math.round(savings + sip * 12 * y),
    })
  }

  res.json({
    inflatedTarget: Math.round(inflatedTarget),
    requiredSip: sip,
    totalInvestment: Math.round(savings + sip * 12 * years),
    projectedCorpus: Math.round(projectedCorpus(savings, sip, retRate, years)),
    wealthGain: Math.round(projectedCorpus(savings, sip, retRate, years) - (savings + sip * 12 * years)),
    years,
    yearlyProjection,
  })
})

// GET /api/goals/:clientId/summary — summary across all goals (includes wealth progress)
router.get('/goals/:clientId/summary', (req, res) => {
  const db = getDb()
  const goals = db.prepare(
    'SELECT * FROM client_goals WHERE client_id = ?'
  ).all(req.params.clientId)

  const enriched = goals.map(g => enrichGoal(g))
  const totalMonthlySip = enriched.reduce((s, g) => s + (g.monthly_sip || 0), 0)
  const totalTargetCorpus = enriched.reduce((s, g) => s + g.inflatedTarget, 0)
  const totalCurrentSavings = enriched.reduce((s, g) => s + g.current_savings, 0)
  const onTrackCount = enriched.filter(g => g.progressPercent >= 90).length
  const atRiskCount = enriched.filter(g => g.progressPercent < 50).length

  // Wealth progress: how existing assets contribute toward goals
  let wealthProgress = null
  try {
    const wealth = getClientWealthForGoals(req.params.clientId)
    const totalWealth = wealth.mfValue + wealth.householdTotal + totalCurrentSavings
    wealthProgress = {
      mfValue: Math.round(wealth.mfValue),
      householdValue: Math.round(wealth.householdTotal),
      currentSavings: Math.round(totalCurrentSavings),
      totalWealth: Math.round(totalWealth),
      totalTarget: Math.round(totalTargetCorpus),
      coveragePercent: totalTargetCorpus > 0 ? Math.round(totalWealth / totalTargetCorpus * 1000) / 10 : 0,
    }
  } catch (_) { /* wealth data optional */ }

  res.json({
    totalGoals: goals.length,
    totalMonthlySip: Math.round(totalMonthlySip),
    totalTargetCorpus: Math.round(totalTargetCorpus),
    totalCurrentSavings: Math.round(totalCurrentSavings),
    onTrackCount,
    atRiskCount,
    wealthProgress,
  })
})

// GET /api/goals/:clientId/:goalId/allocation — recommended asset allocation for a goal
router.get('/goals/:clientId/:goalId/allocation', (req, res) => {
  const db = getDb()
  const goal = db.prepare(
    'SELECT * FROM client_goals WHERE id = ? AND client_id = ?'
  ).get(req.params.goalId, req.params.clientId)
  if (!goal) return res.status(404).json({ message: 'Goal not found' })

  // Check for saved custom allocation
  if (goal.asset_allocation) {
    try {
      const saved = JSON.parse(goal.asset_allocation)
      return res.json({ ...saved, source: 'custom' })
    } catch (_) { /* fall through to computed */ }
  }

  // Fetch client risk profile
  const profile = db.prepare(
    'SELECT * FROM client_profiles WHERE client_id = ?'
  ).get(req.params.clientId)

  // Fetch existing wealth
  const wealth = getClientWealthForGoals(req.params.clientId)

  const result = computeGoalAllocation(goal, profile, wealth)
  res.json({ ...result, source: 'recommended' })
})

// POST /api/goals/:clientId/:goalId/allocation — save custom asset allocation
router.post('/goals/:clientId/:goalId/allocation', (req, res) => {
  const db = getDb()
  const goal = db.prepare(
    'SELECT * FROM client_goals WHERE id = ? AND client_id = ?'
  ).get(req.params.goalId, req.params.clientId)
  if (!goal) return res.status(404).json({ message: 'Goal not found' })

  const { allocations } = req.body
  if (!allocations || !Array.isArray(allocations)) {
    return res.status(400).json({ message: 'allocations array is required' })
  }

  // Validate percentages sum to ~100
  const totalPct = allocations.reduce((s, a) => s + (a.percentage || 0), 0)
  if (Math.abs(totalPct - 100) > 1) {
    return res.status(400).json({ message: `Allocation percentages must sum to 100 (got ${totalPct.toFixed(1)})` })
  }

  // Fetch profile and wealth to compute full allocation object
  const profile = db.prepare(
    'SELECT * FROM client_profiles WHERE client_id = ?'
  ).get(req.params.clientId)
  const wealth = getClientWealthForGoals(req.params.clientId)
  const computed = computeGoalAllocation(goal, profile, wealth)

  // Override allocations with custom values
  const customResult = {
    ...computed,
    allocations: allocations.map(a => ({
      bucket: a.bucket,
      label: a.label || a.bucket,
      percentage: a.percentage,
      suggestedMonthly: Math.round((goal.monthly_sip || 0) * a.percentage / 100),
      expectedReturn: a.expectedReturn || 10,
      rationale: a.rationale || 'Custom allocation',
    })),
  }

  db.prepare(
    'UPDATE client_goals SET asset_allocation = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(JSON.stringify(customResult), req.params.goalId)

  res.json({ ...customResult, source: 'custom' })
})

// Helper: enrich a goal row with computed fields
function enrichGoal(g) {
  const currentYear = new Date().getFullYear()
  const years = Math.max(0, g.target_year - currentYear)
  const inflatedTarget = inflationAdjusted(g.target_amount, g.inflation_rate, years)
  const corpus = projectedCorpus(g.current_savings, g.monthly_sip || 0, g.expected_return, years)
  const progressPercent = inflatedTarget > 0 ? Math.min(100, (corpus / inflatedTarget) * 100) : 0

  return {
    ...g,
    years_remaining: years,
    inflatedTarget: Math.round(inflatedTarget),
    projectedCorpus: Math.round(corpus),
    shortfall: Math.round(Math.max(0, inflatedTarget - corpus)),
    progressPercent: Math.round(progressPercent * 10) / 10,
  }
}

export default router
