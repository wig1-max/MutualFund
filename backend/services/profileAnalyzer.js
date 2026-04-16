import { getDb } from '../db/index.js'

export function computeProfile(raw) {
  const monthlyIncome    = Number(raw.monthly_income)    || 0
  const monthlyExpenses  = Number(raw.monthly_expenses)  || 0
  const monthlyEmi       = Number(raw.monthly_emi)       || 0
  const age              = Number(raw.age)               || 0
  const dependents       = Number(raw.dependents)        || 0
  const horizon          = Number(raw.investment_horizon)|| 0
  const incomeType       = (raw.income_type || '').trim()
  const hasEmergencyFund = raw.has_emergency_fund ? 1 : 0
  const q                = raw.questionnaire_responses   || {}

  const investable_surplus = Math.max(
    0, monthlyIncome - monthlyExpenses - monthlyEmi
  )

  // ─────────────────────────────────────────────────────────────
  // SCORE A: RISK CAPACITY — financial ability to bear risk
  // Inputs: age, horizon, income type, dependents, EMI ratio,
  //         emergency fund only. NO behavioral inputs here.
  // ─────────────────────────────────────────────────────────────
  let capacityScore = 50

  // Age
  if      (age < 25) capacityScore += 20
  else if (age < 30) capacityScore += 15
  else if (age < 35) capacityScore += 10
  else if (age < 45) capacityScore += 5
  else if (age < 55) capacityScore -= 5
  else if (age < 65) capacityScore -= 15
  else               capacityScore -= 20

  // Investment horizon
  if      (horizon >= 15) capacityScore += 20
  else if (horizon >= 10) capacityScore += 15
  else if (horizon >= 7)  capacityScore += 8
  else if (horizon >= 5)  capacityScore += 2
  else if (horizon >= 3)  capacityScore -= 8
  else                    capacityScore -= 20

  // Income type stability
  const incLower = incomeType.toLowerCase()
  if      (incLower === 'salaried')  capacityScore += 8
  else if (incLower === 'business')  capacityScore += 3
  else if (incLower === 'freelance') capacityScore -= 3
  else if (incLower === 'retired')   capacityScore -= 12

  // Dependents — each reduces capacity
  capacityScore -= dependents * 5

  // EMI burden as % of income
  if (monthlyIncome > 0) {
    const emiRatio = monthlyEmi / monthlyIncome
    if      (emiRatio > 0.5)  capacityScore -= 15
    else if (emiRatio > 0.4)  capacityScore -= 10
    else if (emiRatio > 0.3)  capacityScore -= 5
    else if (emiRatio < 0.1)  capacityScore += 5
  }

  // Emergency fund — no fund = must reduce equity exposure
  if (!hasEmergencyFund) capacityScore -= 8

  // Clamp 0–100
  const risk_capacity_score = Math.max(0, Math.min(100,
    Math.round(capacityScore * 100) / 100
  ))

  // ─────────────────────────────────────────────────────────────
  // SCORE B: RISK TOLERANCE — psychological willingness to bear risk
  // Inputs: questionnaire responses ONLY.
  // 8 questions, each on a 1-5 Likert scale with 3 = neutral.
  // Higher response = higher risk tolerance.
  // Each unit from centre shifts ±POINTS_PER_UNIT; with 8 questions
  // at max deviation (±2) we reach the 0 or 100 bound exactly.
  // If no questionnaire data exists, stays at 50 (neutral).
  // ─────────────────────────────────────────────────────────────
  const QUESTION_KEYS = [
    'market_fall_reaction',        // panic sell  → buy more
    'loss_tolerance',              // no loss OK → large loss OK
    'investment_experience',       // first time → expert
    'goal_clarity',                // vague      → clearly defined
    'time_horizon_flexibility',    // rigid      → very flexible
    'portfolio_gain_reaction',     // lock gains → stay invested
    'financial_literacy',          // basic      → expert
    'income_stability_confidence', // uncertain  → very confident
  ]
  const SCALE_MIN = 1, SCALE_MAX = 5, SCALE_CENTER = 3
  // 8 questions × 2 max units × 3.125 pts/unit = 50 pts (→ 0/100 bound)
  const POINTS_PER_UNIT = 50 / (QUESTION_KEYS.length * (SCALE_MAX - SCALE_CENTER))

  let toleranceScore = 50
  let answeredCount = 0
  for (const key of QUESTION_KEYS) {
    const v = Number(q[key])
    if (!isNaN(v) && v >= SCALE_MIN && v <= SCALE_MAX) {
      toleranceScore += (v - SCALE_CENTER) * POINTS_PER_UNIT
      answeredCount++
    }
  }

  // Clamp 0–100
  const risk_tolerance_score = Math.max(0, Math.min(100,
    Math.round(toleranceScore * 100) / 100
  ))

  // ─────────────────────────────────────────────────────────────
  // EFFECTIVE SCORE: NISM rule — always use the LOWER of the two
  // This protects clients who WANT more risk than they can AFFORD
  // ─────────────────────────────────────────────────────────────
  const risk_effective_score = Math.min(
    risk_capacity_score, risk_tolerance_score
  )

  // ─────────────────────────────────────────────────────────────
  // RISK LABEL — derived from effective score
  // ─────────────────────────────────────────────────────────────
  let risk_label
  if      (risk_effective_score < 25) risk_label = 'Conservative'
  else if (risk_effective_score < 45) risk_label = 'Moderate Conservative'
  else if (risk_effective_score < 65) risk_label = 'Moderate'
  else if (risk_effective_score < 80) risk_label = 'Moderately Aggressive'
  else                                risk_label = 'Aggressive'

  // ─────────────────────────────────────────────────────────────
  // ALLOCATION — based on effective score
  // ─────────────────────────────────────────────────────────────
  let equity, debt, gold
  if      (risk_effective_score < 25) { equity = 20; debt = 70; gold = 10 }
  else if (risk_effective_score < 45) { equity = 40; debt = 50; gold = 10 }
  else if (risk_effective_score < 65) { equity = 60; debt = 30; gold = 10 }
  else if (risk_effective_score < 80) { equity = 75; debt = 20; gold = 5  }
  else                                { equity = 85; debt = 10; gold = 5  }

  // Short horizon shifts equity to debt
  if (horizon < 3) {
    const shift = Math.min(30, equity)
    equity -= shift; debt += shift
  } else if (horizon < 5) {
    const shift = Math.min(15, equity)
    equity -= shift; debt += shift
  }

  // Age > 55 shifts equity to debt
  if (age > 55) {
    const shift = Math.min(15, equity)
    equity -= shift; debt += shift
  }

  // Normalise to 100
  const total = equity + debt + gold
  if (total > 0) {
    equity = Math.round(equity / total * 100)
    debt   = Math.round(debt   / total * 100)
    gold   = 100 - equity - debt
  }

  // Profile completeness — requires financial inputs + full questionnaire
  const hasFinancials = monthlyIncome > 0 && age > 0 &&
                        horizon > 0 && raw.tax_slab
  const hasQuestionnaire = answeredCount === QUESTION_KEYS.length
  const profile_complete = (hasFinancials && hasQuestionnaire) ? 1 : 0

  return {
    monthly_income:         monthlyIncome,
    monthly_expenses:       monthlyExpenses,
    monthly_emi:            monthlyEmi,
    income_type:            incomeType,
    tax_slab:               raw.tax_slab || null,
    age,
    dependents,
    has_home_loan:          raw.has_home_loan ? 1 : 0,
    has_emergency_fund:     hasEmergencyFund,
    emergency_fund_months:  Number(raw.emergency_fund_months) || 0,
    investment_horizon:     horizon,
    primary_goal:           raw.primary_goal || null,
    elss_invested_this_year: Number(raw.elss_invested_this_year) || 0,
    existing_pf_balance:    Number(raw.existing_pf_balance) || 0,
    investable_surplus,
    risk_capacity_score,
    risk_tolerance_score,
    risk_effective_score,
    risk_label,
    recommended_equity_pct: equity,
    recommended_debt_pct:   debt,
    recommended_gold_pct:   gold,
    questionnaire_responses: JSON.stringify(q),
    profile_complete,
    last_scored_at:         new Date().toISOString(),
  }
}

export function upsertProfile(clientId, raw) {
  const computed = computeProfile(raw)
  const db = getDb()

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO client_profiles (
      client_id, monthly_income, monthly_expenses, monthly_emi, income_type,
      tax_slab, age, dependents, has_home_loan, has_emergency_fund,
      emergency_fund_months, investment_horizon, primary_goal,
      elss_invested_this_year, existing_pf_balance, investable_surplus,
      risk_capacity_score, risk_tolerance_score, risk_effective_score,
      risk_label, recommended_equity_pct,
      recommended_debt_pct, recommended_gold_pct, questionnaire_responses,
      profile_complete, last_scored_at, updated_at
    ) VALUES (
      @client_id, @monthly_income, @monthly_expenses, @monthly_emi, @income_type,
      @tax_slab, @age, @dependents, @has_home_loan, @has_emergency_fund,
      @emergency_fund_months, @investment_horizon, @primary_goal,
      @elss_invested_this_year, @existing_pf_balance, @investable_surplus,
      @risk_capacity_score, @risk_tolerance_score, @risk_effective_score,
      @risk_label, @recommended_equity_pct,
      @recommended_debt_pct, @recommended_gold_pct, @questionnaire_responses,
      @profile_complete, @last_scored_at, datetime('now')
    )
  `)

  stmt.run({ client_id: clientId, ...computed })

  return db.prepare('SELECT * FROM client_profiles WHERE client_id = ?').get(clientId)
}
