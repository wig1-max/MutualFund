import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '../db/index.js'
import { batchPrefetchNavs } from '../services/navCache.js'
import { calculateReturns, getNavOnDate } from '../services/calculations.js'
import { isEquityFund } from '../utils/fundClassification.js'

const router = Router()

// Initialize Anthropic client — reads ANTHROPIC_API_KEY from env
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }
  return new Anthropic({ apiKey })
}

// Report types and their data requirements
const REPORT_TYPES = {
  portfolio_review: {
    label: 'Portfolio Review',
    description: 'Comprehensive portfolio health check with allocation analysis, performance, and recommendations',
    dataSources: ['portfolio', 'holdings'],
  },
  goal_progress: {
    label: 'Goal Progress Report',
    description: 'Client goal tracking, SIP adequacy, and projected outcomes',
    dataSources: ['goals'],
  },
  tax_summary: {
    label: 'Tax Planning Summary',
    description: 'Capital gains breakdown, tax liability estimate, and harvesting opportunities',
    dataSources: ['tax'],
  },
  comprehensive: {
    label: 'Comprehensive Review',
    description: 'Full client review combining portfolio, goals, and tax analysis',
    dataSources: ['portfolio', 'holdings', 'goals', 'tax'],
  },
}

// GET /api/reports/types — list available report types
router.get('/reports/types', (req, res) => {
  const types = Object.entries(REPORT_TYPES).map(([key, val]) => ({
    id: key,
    ...val,
  }))
  res.json(types)
})

// POST /api/reports/generate — generate a report using Claude API
router.post('/reports/generate', async (req, res) => {
  const { clientId, reportType, customInstructions } = req.body

  if (!clientId || !reportType) {
    return res.status(400).json({ message: 'clientId and reportType are required' })
  }

  if (!REPORT_TYPES[reportType]) {
    return res.status(400).json({ message: `Invalid report type. Valid types: ${Object.keys(REPORT_TYPES).join(', ')}` })
  }

  const db = getDb()
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  try {
    // Gather data based on report type
    const data = await gatherClientData(db, clientId, REPORT_TYPES[reportType].dataSources)

    // Build the prompt
    const prompt = buildPrompt(client, reportType, data, customInstructions)

    // Call Claude API
    const anthropic = getAnthropicClient()
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const reportContent = message.content[0]?.text || ''

    // Return structured response
    res.json({
      client: { id: client.id, name: client.name, email: client.email, phone: client.phone },
      reportType,
      reportLabel: REPORT_TYPES[reportType].label,
      generatedAt: new Date().toISOString(),
      content: reportContent,
      data, // raw data for charts on frontend
    })
  } catch (err) {
    console.error('Report generation error:', err.message)
    if (err.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(500).json({ message: 'API key not configured. Set ANTHROPIC_API_KEY environment variable.' })
    }
    res.status(500).json({ message: `Report generation failed: ${err.message}` })
  }
})

// Gather all client data needed for the report
async function gatherClientData(db, clientId, dataSources) {
  const data = {}

  if (dataSources.includes('portfolio') || dataSources.includes('holdings')) {
    const holdings = db.prepare(
      'SELECT * FROM client_holdings WHERE client_id = ?'
    ).all(clientId)

    if (holdings.length > 0) {
      const schemeCodes = [...new Set(holdings.map(h => h.scheme_code))]
      const navDataMap = await batchPrefetchNavs(schemeCodes)

      data.holdings = holdings.map(h => {
        const fundInfo = db.prepare('SELECT * FROM funds WHERE scheme_code = ?').get(h.scheme_code)
        const navData = navDataMap[h.scheme_code] || []
        const currentNav = navData.length > 0 ? navData[navData.length - 1].nav : (fundInfo?.nav || null)
        let currentValue = h.invested_amount
        let units = h.units

        if (navData.length > 0 && h.purchase_date && !units) {
          const pNav = getNavOnDate(navData, h.purchase_date)
          if (pNav) units = h.invested_amount / pNav.nav
        }
        if (units && currentNav) currentValue = units * currentNav

        let returns = null
        if (navData.length > 0) returns = calculateReturns(navData)

        return {
          scheme_name: h.scheme_name || fundInfo?.scheme_name || h.scheme_code,
          scheme_code: h.scheme_code,
          category: fundInfo?.scheme_category || '',
          amc: fundInfo?.amc || '',
          invested: h.invested_amount,
          currentValue: Math.round(currentValue),
          gain: Math.round(currentValue - h.invested_amount),
          gainPercent: h.invested_amount > 0 ? Math.round((currentValue - h.invested_amount) / h.invested_amount * 100 * 100) / 100 : 0,
          purchase_date: h.purchase_date,
          returns: returns ? {
            '1Y': returns['1Y']?.return ?? null,
            '3Y': returns['3Y']?.return ?? null,
            '5Y': returns['5Y']?.return ?? null,
          } : null,
        }
      })

      const totalInvested = data.holdings.reduce((s, h) => s + h.invested, 0)
      const totalCurrent = data.holdings.reduce((s, h) => s + h.currentValue, 0)
      data.portfolioSummary = {
        totalInvested: Math.round(totalInvested),
        currentValue: Math.round(totalCurrent),
        totalGain: Math.round(totalCurrent - totalInvested),
        gainPercent: totalInvested > 0 ? Math.round((totalCurrent - totalInvested) / totalInvested * 100 * 100) / 100 : 0,
        holdingsCount: holdings.length,
      }
    } else {
      data.holdings = []
      data.portfolioSummary = { totalInvested: 0, currentValue: 0, totalGain: 0, gainPercent: 0, holdingsCount: 0 }
    }
  }

  if (dataSources.includes('goals')) {
    const goals = db.prepare(
      'SELECT * FROM client_goals WHERE client_id = ? ORDER BY target_year ASC'
    ).all(clientId)

    const currentYear = new Date().getFullYear()
    data.goals = goals.map(g => {
      const years = Math.max(0, g.target_year - currentYear)
      const inflatedTarget = g.target_amount * Math.pow(1 + g.inflation_rate / 100, years)
      return {
        goal_name: g.goal_name,
        goal_type: g.goal_type,
        target_amount: g.target_amount,
        target_year: g.target_year,
        years_remaining: years,
        inflated_target: Math.round(inflatedTarget),
        current_savings: g.current_savings,
        monthly_sip: g.monthly_sip,
        expected_return: g.expected_return,
        priority: g.priority,
      }
    })
  }

  if (dataSources.includes('tax')) {
    const holdings = db.prepare(
      'SELECT * FROM client_holdings WHERE client_id = ?'
    ).all(clientId)

    if (holdings.length > 0) {
      const schemeCodes = [...new Set(holdings.map(h => h.scheme_code))]
      const navDataMap = await batchPrefetchNavs(schemeCodes)
      const today = new Date()

      let equitySTCG = 0, equityLTCG = 0, debtSTCG = 0, debtLTCG = 0, totalLoss = 0

      const taxHoldings = holdings.map(h => {
        const fundInfo = db.prepare('SELECT * FROM funds WHERE scheme_code = ?').get(h.scheme_code)
        const category = fundInfo?.scheme_category || ''
        const isEquity = isEquityFund(category)
        const navData = navDataMap[h.scheme_code] || []
        const currentNav = navData.length > 0 ? navData[navData.length - 1].nav : (fundInfo?.nav || null)
        let units = h.units
        if (!units && h.purchase_date && navData.length > 0) {
          const pNav = getNavOnDate(navData, h.purchase_date)
          if (pNav) units = h.invested_amount / pNav.nav
        }
        const currentValue = units && currentNav ? units * currentNav : h.invested_amount
        const gain = currentValue - h.invested_amount

        let holdingMonths = 0
        if (h.purchase_date) {
          const pd = new Date(h.purchase_date)
          holdingMonths = (today.getFullYear() - pd.getFullYear()) * 12 + (today.getMonth() - pd.getMonth())
        }
        const longTermThreshold = isEquity ? 12 : 36
        const isLongTerm = holdingMonths >= longTermThreshold

        if (gain > 0) {
          if (isEquity) { if (isLongTerm) equityLTCG += gain; else equitySTCG += gain; }
          else { if (isLongTerm) debtLTCG += gain; else debtSTCG += gain; }
        } else if (gain < 0) {
          totalLoss += Math.abs(gain)
        }

        return {
          scheme_name: h.scheme_name || fundInfo?.scheme_name || h.scheme_code,
          fundType: isEquity ? 'Equity' : 'Debt',
          invested: h.invested_amount,
          currentValue: Math.round(currentValue),
          gain: Math.round(gain),
          holdingMonths,
          gainType: isLongTerm ? 'LTCG' : 'STCG',
        }
      })

      const equityLTCGAfterExemption = Math.max(0, equityLTCG - 125000)
      const totalTax = Math.round(
        equitySTCG * 0.20 + equityLTCGAfterExemption * 0.125 + debtSTCG * 0.30 + debtLTCG * 0.30
      )

      data.taxSummary = {
        equitySTCG: Math.round(equitySTCG),
        equityLTCG: Math.round(equityLTCG),
        equityLTCGAfterExemption: Math.round(equityLTCGAfterExemption),
        debtSTCG: Math.round(debtSTCG),
        debtLTCG: Math.round(debtLTCG),
        estimatedTax: totalTax,
        totalUnrealizedLoss: Math.round(totalLoss),
        holdings: taxHoldings,
      }
    } else {
      data.taxSummary = { equitySTCG: 0, equityLTCG: 0, equityLTCGAfterExemption: 0, debtSTCG: 0, debtLTCG: 0, estimatedTax: 0, totalUnrealizedLoss: 0, holdings: [] }
    }
  }

  // Client notes
  const notes = db.prepare(
    'SELECT note, created_at FROM client_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(clientId)
  data.recentNotes = notes

  // Client financial profile
  const profile = db.prepare('SELECT * FROM client_profiles WHERE client_id = ?').get(clientId)
  if (profile) {
    data.clientProfile = {
      age: profile.age,
      income_type: profile.income_type,
      monthly_income: profile.monthly_income,
      monthly_expenses: profile.monthly_expenses,
      monthly_emi: profile.monthly_emi,
      tax_slab: profile.tax_slab,
      investable_surplus: profile.investable_surplus,
      risk_label: profile.risk_label,
      risk_capacity_score: profile.risk_capacity_score,
      investment_horizon: profile.investment_horizon,
      primary_goal: profile.primary_goal,
      recommended_equity_pct: profile.recommended_equity_pct,
      recommended_debt_pct: profile.recommended_debt_pct,
      recommended_gold_pct: profile.recommended_gold_pct,
      elss_invested_this_year: profile.elss_invested_this_year,
      existing_pf_balance: profile.existing_pf_balance,
    }
  }

  // Top fund recommendations
  const recs = db.prepare(
    'SELECT * FROM fund_recommendations WHERE client_id = ? ORDER BY rank ASC LIMIT 5'
  ).all(clientId)
  if (recs.length > 0) {
    data.topRecommendations = recs.map(r => ({
      scheme_name: r.scheme_name,
      allocation_bucket: r.allocation_bucket,
      composite_score: r.composite_score,
      recommended_sip: r.recommended_sip,
      reasons: (() => { try { return JSON.parse(r.reasons) } catch { return [] } })(),
    }))
  }

  return data
}

function buildPrompt(client, reportType, data, customInstructions) {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmtRs = (v) => Number(v || 0).toLocaleString('en-IN')

  let prompt = `You are a professional mutual fund advisor writing a report for a client. Generate a well-structured, professional investment review report.

**Report Details:**
- Client Name: ${client.name}
- Report Type: ${REPORT_TYPES[reportType].label}
- Date: ${today}
- Advisor: Tejova Mutual Fund Distribution

**Important Guidelines:**
- Write in professional but accessible language suitable for an Indian mutual fund investor
- Use Indian currency format (e.g., "Rs 10,00,000" or "Rs 10 lakh")
- Include specific numbers and data from the provided information
- Provide actionable recommendations where appropriate
- Add a SEBI disclaimer at the end: "Mutual fund investments are subject to market risks. Please read all scheme related documents carefully before investing. Past performance is not indicative of future returns."
- Format the report using markdown with clear sections, headers (##), bullet points, and bold text for key figures
- Keep the tone professional yet warm — this is for a real client relationship
- Do NOT use any HTML tags — only markdown formatting

`

  if (data.clientProfile) {
    const p = data.clientProfile
    const elssLimit = 150000
    const elssHeadroom = Math.max(0, elssLimit - (p.elss_invested_this_year || 0))
    prompt += `**Client Financial Profile:**
- Age: ${p.age} | Income Type: ${p.income_type}
- Monthly Income: Rs ${fmtRs(p.monthly_income)} | Expenses: Rs ${fmtRs(p.monthly_expenses)} | EMIs: Rs ${fmtRs(p.monthly_emi)}
- Investable Surplus: Rs ${fmtRs(p.investable_surplus)}
- Tax Slab: ${p.tax_slab}
- Investment Horizon: ${p.investment_horizon} years
- Risk Profile: ${p.risk_label} (score: ${p.risk_capacity_score}/100)
- Primary Goal: ${p.primary_goal || 'Not specified'}
- Recommended Allocation: Equity ${p.recommended_equity_pct}% / Debt ${p.recommended_debt_pct}% / Gold ${p.recommended_gold_pct}%
- ELSS Invested This Year: Rs ${fmtRs(p.elss_invested_this_year)} (headroom: Rs ${fmtRs(elssHeadroom)} of Rs 1,50,000 limit)
- Existing PF Balance: Rs ${fmtRs(p.existing_pf_balance)}

`
  }

  if (data.topRecommendations && data.topRecommendations.length > 0) {
    prompt += `**AI-Generated Fund Recommendations:**
${data.topRecommendations.map((r, i) => `${i + 1}. ${r.scheme_name} | Bucket: ${r.allocation_bucket} | Score: ${r.composite_score}/80 | Recommended SIP: Rs ${fmtRs(r.recommended_sip)} | Reasons: ${Array.isArray(r.reasons) ? r.reasons.join('; ') : r.reasons || 'N/A'}`).join('\n')}

`
  }

  if (data.portfolioSummary) {
    prompt += `\n**Portfolio Data:**
- Total Invested: Rs ${data.portfolioSummary.totalInvested.toLocaleString('en-IN')}
- Current Value: Rs ${data.portfolioSummary.currentValue.toLocaleString('en-IN')}
- Total Gain: Rs ${data.portfolioSummary.totalGain.toLocaleString('en-IN')} (${data.portfolioSummary.gainPercent}%)
- Number of Holdings: ${data.portfolioSummary.holdingsCount}

**Holdings Detail:**
${data.holdings.map(h => `- ${h.scheme_name} | Category: ${h.category || 'N/A'} | Invested: Rs ${h.invested.toLocaleString('en-IN')} | Current: Rs ${h.currentValue.toLocaleString('en-IN')} | Gain: ${h.gainPercent}% | 1Y: ${h.returns?.['1Y'] != null ? h.returns['1Y'] + '%' : 'N/A'} | 3Y: ${h.returns?.['3Y'] != null ? h.returns['3Y'] + '%' : 'N/A'}`).join('\n')}
`
  }

  if (data.goals && data.goals.length > 0) {
    prompt += `\n**Financial Goals:**
${data.goals.map(g => `- ${g.goal_name} (${g.goal_type}) | Target: Rs ${g.target_amount.toLocaleString('en-IN')} by ${g.target_year} (${g.years_remaining} years) | Inflation-adjusted: Rs ${g.inflated_target.toLocaleString('en-IN')} | Monthly SIP: Rs ${(g.monthly_sip || 0).toLocaleString('en-IN')} | Priority: ${g.priority}`).join('\n')}
`
  }

  if (data.taxSummary) {
    prompt += `\n**Tax Analysis (Budget 2024 Rules):**
- Equity STCG (20%): Rs ${data.taxSummary.equitySTCG.toLocaleString('en-IN')}
- Equity LTCG (12.5% above Rs 1.25L exemption): Rs ${data.taxSummary.equityLTCG.toLocaleString('en-IN')} (taxable: Rs ${data.taxSummary.equityLTCGAfterExemption.toLocaleString('en-IN')})
- Debt STCG/LTCG (30% slab): Rs ${(data.taxSummary.debtSTCG + data.taxSummary.debtLTCG).toLocaleString('en-IN')}
- Estimated Total Tax: Rs ${data.taxSummary.estimatedTax.toLocaleString('en-IN')}
- Unrealized Losses: Rs ${data.taxSummary.totalUnrealizedLoss.toLocaleString('en-IN')}
`
  }

  if (data.recentNotes && data.recentNotes.length > 0) {
    prompt += `\n**Recent Advisor Notes:**
${data.recentNotes.map(n => `- [${n.created_at}] ${n.note}`).join('\n')}
`
  }

  if (customInstructions) {
    prompt += `\n**Additional Instructions from Advisor:**
${customInstructions}
`
  }

  // Report-specific instructions
  switch (reportType) {
    case 'portfolio_review':
      prompt += `\nGenerate a Portfolio Review Report with these sections:
1. Executive Summary
2. Portfolio Overview (value, gains, allocation)
3. Fund-wise Performance Analysis
4. Asset Allocation Assessment
5. Key Observations & Risk Factors
6. Recommendations
7. Disclaimer`
      break
    case 'goal_progress':
      prompt += `\nGenerate a Goal Progress Report with these sections:
1. Executive Summary
2. Goal-wise Progress Tracker
3. SIP Adequacy Analysis
4. Gap Analysis (shortfalls and surplus)
5. Recommendations to Stay on Track
6. Disclaimer`
      break
    case 'tax_summary':
      prompt += `\nGenerate a Tax Planning Summary with these sections:
1. Executive Summary
2. Capital Gains Breakdown (STCG/LTCG by fund type)
3. Tax Liability Estimate
4. Tax-Loss Harvesting Opportunities
5. Tax-Saving Recommendations
6. Disclaimer`
      break
    case 'comprehensive':
      prompt += `\nGenerate a Comprehensive Review Report with these sections:
1. Executive Summary
2. Portfolio Health (value, gains, allocation)
3. Fund-wise Performance
4. Goal Progress & SIP Adequacy
5. Tax Position & Planning
6. Key Recommendations (prioritized action items)
7. Next Review Date Suggestion
8. Disclaimer`
      break
  }

  return prompt
}

export default router
