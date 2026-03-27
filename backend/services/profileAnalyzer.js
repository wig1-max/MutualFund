import { getDb } from '../db/index.js'

export function computeProfile(raw) {
  const monthlyIncome = Number(raw.monthly_income) || 0
  const monthlyExpenses = Number(raw.monthly_expenses) || 0
  const monthlyEmi = Number(raw.monthly_emi) || 0
  const age = Number(raw.age) || 0
  const dependents = Number(raw.dependents) || 0
  const horizon = Number(raw.investment_horizon) || 0
  const incomeType = (raw.income_type || '').trim()
  const hasEmergencyFund = raw.has_emergency_fund ? 1 : 0
  const q = raw.questionnaire_responses || {}

  const investable_surplus = Math.max(0, monthlyIncome - monthlyExpenses - monthlyEmi)

  // --- Risk capacity score ---
  let score = 50

  // Age adjustment
  if (age < 25) score += 20
  else if (age < 30) score += 15
  else if (age < 35) score += 10
  else if (age < 45) score += 5
  else if (age < 55) score -= 5
  else if (age < 65) score -= 15
  else score -= 20

  // Horizon adjustment
  if (horizon >= 15) score += 20
  else if (horizon >= 10) score += 15
  else if (horizon >= 7) score += 8
  else if (horizon >= 5) score += 2
  else if (horizon >= 3) score -= 8
  else score -= 20

  // Income type
  const incomeTypeLower = incomeType.toLowerCase()
  if (incomeTypeLower === 'salaried') score += 8
  else if (incomeTypeLower === 'business') score += 3
  else if (incomeTypeLower === 'freelance') score -= 3
  else if (incomeTypeLower === 'retired') score -= 12

  // Dependents
  score -= dependents * 5

  // EMI/income ratio
  if (monthlyIncome > 0) {
    const emiRatio = monthlyEmi / monthlyIncome
    if (emiRatio > 0.5) score -= 15
    else if (emiRatio > 0.4) score -= 10
    else if (emiRatio > 0.3) score -= 5
    else if (emiRatio < 0.1) score += 5
  }

  // Emergency fund
  if (!hasEmergencyFund) score -= 8

  // Questionnaire responses
  const marketFall = Number(q.market_fall_reaction)
  if (!isNaN(marketFall)) score += (marketFall - 5) * 2.5

  const lossTolerance = Number(q.loss_tolerance)
  if (!isNaN(lossTolerance)) score += (lossTolerance - 5) * 2.5

  const experience = Number(q.investment_experience)
  if (!isNaN(experience)) score += (experience - 3) * 1.5

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score))
  const risk_capacity_score = Math.round(score * 100) / 100

  // --- Risk label ---
  let risk_label
  if (score < 25) risk_label = 'Conservative'
  else if (score < 45) risk_label = 'Moderate Conservative'
  else if (score < 65) risk_label = 'Moderate'
  else if (score < 80) risk_label = 'Moderately Aggressive'
  else risk_label = 'Aggressive'

  // --- Recommended allocation ---
  let equity, debt, gold
  if (score < 25) { equity = 20; debt = 70; gold = 10 }
  else if (score < 45) { equity = 40; debt = 50; gold = 10 }
  else if (score < 65) { equity = 60; debt = 30; gold = 10 }
  else if (score < 80) { equity = 75; debt = 20; gold = 5 }
  else { equity = 85; debt = 10; gold = 5 }

  // Short horizon shifts equity → debt
  if (horizon < 3) {
    const shift = Math.min(30, equity)
    equity -= shift
    debt += shift
  } else if (horizon < 5) {
    const shift = Math.min(15, equity)
    equity -= shift
    debt += shift
  }

  // Age >55 shifts equity → debt
  if (age > 55) {
    const shift = Math.min(15, equity)
    equity -= shift
    debt += shift
  }

  // Normalise to sum to 100
  const total = equity + debt + gold
  if (total > 0) {
    equity = Math.round(equity / total * 100)
    debt = Math.round(debt / total * 100)
    gold = 100 - equity - debt
  }

  // --- Profile completeness ---
  const profile_complete = (monthlyIncome > 0 && age > 0 && horizon > 0 && raw.tax_slab) ? 1 : 0

  return {
    monthly_income: monthlyIncome,
    monthly_expenses: monthlyExpenses,
    monthly_emi: monthlyEmi,
    income_type: incomeType,
    tax_slab: raw.tax_slab || null,
    age,
    dependents,
    has_home_loan: raw.has_home_loan ? 1 : 0,
    has_emergency_fund: hasEmergencyFund,
    emergency_fund_months: Number(raw.emergency_fund_months) || 0,
    investment_horizon: horizon,
    primary_goal: raw.primary_goal || null,
    elss_invested_this_year: Number(raw.elss_invested_this_year) || 0,
    existing_pf_balance: Number(raw.existing_pf_balance) || 0,
    investable_surplus,
    risk_capacity_score,
    risk_label,
    recommended_equity_pct: equity,
    recommended_debt_pct: debt,
    recommended_gold_pct: gold,
    questionnaire_responses: JSON.stringify(q),
    profile_complete,
    last_scored_at: new Date().toISOString()
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
      risk_capacity_score, risk_label, recommended_equity_pct,
      recommended_debt_pct, recommended_gold_pct, questionnaire_responses,
      profile_complete, last_scored_at, updated_at
    ) VALUES (
      @client_id, @monthly_income, @monthly_expenses, @monthly_emi, @income_type,
      @tax_slab, @age, @dependents, @has_home_loan, @has_emergency_fund,
      @emergency_fund_months, @investment_horizon, @primary_goal,
      @elss_invested_this_year, @existing_pf_balance, @investable_surplus,
      @risk_capacity_score, @risk_label, @recommended_equity_pct,
      @recommended_debt_pct, @recommended_gold_pct, @questionnaire_responses,
      @profile_complete, @last_scored_at, datetime('now')
    )
  `)

  stmt.run({ client_id: clientId, ...computed })

  return db.prepare('SELECT * FROM client_profiles WHERE client_id = ?').get(clientId)
}
