import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '../db/index.js'
import { batchPrefetchNavs } from '../services/navCache.js'
import { calculateReturns, getNavOnDate } from '../services/calculations.js'
import { isEquityFund } from '../utils/fundClassification.js'
import { estimateCurrentValue } from '../services/assetValuation.js'
import { computeAssetTax } from '../services/taxRulesRegistry.js'

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
  wealth_report: {
    label: 'Comprehensive Wealth Report',
    description: 'Unified wealth view covering mutual funds + household assets (FDs, stocks, real estate, gold, NPS, insurance)',
    dataSources: ['portfolio', 'holdings', 'wealth'],
  },
  goal_allocation: {
    label: 'Goal Progress with Allocation',
    description: 'Goal tracking with per-goal asset allocation breakdown and multi-asset recommendations',
    dataSources: ['goals', 'goalAllocations', 'wealth'],
  },
  tax_planning: {
    label: 'Household Tax Planning Report',
    description: 'Combined MF + household asset tax analysis with Budget 2024 rules across all asset classes',
    dataSources: ['tax', 'householdTax', 'wealth'],
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
      max_tokens: 1500,
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

  // Wealth: household assets
  if (dataSources.includes('wealth')) {
    const assets = db.prepare(
      'SELECT * FROM household_assets WHERE client_id = ? ORDER BY asset_type, name'
    ).all(clientId)

    data.householdAssets = assets.map(a => {
      const estimated = estimateCurrentValue(a)
      return {
        name: a.name,
        asset_type: a.asset_type,
        asset_subtype: a.asset_subtype,
        invested_amount: a.invested_amount,
        current_value: estimated || a.current_value || a.invested_amount,
        purchase_date: a.purchase_date,
        maturity_date: a.maturity_date,
        interest_rate: a.interest_rate,
        notes: a.notes,
      }
    })

    const mfValue = data.portfolioSummary?.currentValue || 0
    const mfInvested = data.portfolioSummary?.totalInvested || 0
    const assetValue = data.householdAssets.reduce((s, a) => s + (a.current_value || 0), 0)
    const assetInvested = data.householdAssets.reduce((s, a) => s + (a.invested_amount || 0), 0)

    data.wealthSummary = {
      mf_current_value: mfValue,
      mf_invested: mfInvested,
      household_current_value: Math.round(assetValue),
      household_invested: Math.round(assetInvested),
      total_wealth: Math.round(mfValue + assetValue),
      total_invested: Math.round(mfInvested + assetInvested),
      total_gain: Math.round((mfValue + assetValue) - (mfInvested + assetInvested)),
      asset_type_breakdown: {},
    }

    // Group by asset type
    for (const a of data.householdAssets) {
      if (!data.wealthSummary.asset_type_breakdown[a.asset_type]) {
        data.wealthSummary.asset_type_breakdown[a.asset_type] = { count: 0, value: 0 }
      }
      data.wealthSummary.asset_type_breakdown[a.asset_type].count++
      data.wealthSummary.asset_type_breakdown[a.asset_type].value += a.current_value || 0
    }
  }

  // Goal allocations
  if (dataSources.includes('goalAllocations') && data.goals) {
    const goalsWithAlloc = db.prepare(
      'SELECT id, goal_name, asset_allocation FROM client_goals WHERE client_id = ? AND asset_allocation IS NOT NULL'
    ).all(clientId)

    data.goalAllocations = goalsWithAlloc.map(g => {
      let allocation = null
      try { allocation = JSON.parse(g.asset_allocation) } catch {}
      return { goal_id: g.id, goal_name: g.goal_name, allocation }
    }).filter(g => g.allocation)
  }

  // Household tax analysis
  if (dataSources.includes('householdTax')) {
    const assets = db.prepare(
      'SELECT * FROM household_assets WHERE client_id = ?'
    ).all(clientId)

    const profile = db.prepare('SELECT tax_slab FROM client_profiles WHERE client_id = ?').get(clientId)
    const slabRate = profile?.tax_slab ? parseFloat(profile.tax_slab) / 100 : 0.30

    data.householdTaxAnalysis = assets.map(a => {
      const estimated = estimateCurrentValue(a)
      const currentVal = estimated || a.current_value || a.invested_amount
      const taxResult = computeAssetTax(a, currentVal, slabRate)
      return {
        name: a.name,
        asset_type: a.asset_type,
        invested: a.invested_amount,
        current_value: currentVal,
        gain: Math.round(currentVal - a.invested_amount),
        ...taxResult,
      }
    })

    const totalHouseholdTax = data.householdTaxAnalysis.reduce((s, a) => s + (a.tax_amount || 0), 0)
    data.householdTaxTotal = Math.round(totalHouseholdTax)
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
- CRITICAL LENGTH LIMIT: Keep the report to 1 page (~400-500 words). Only in complex cases with many holdings, allow up to 2 pages max. Be concise — bullet points, short sentences, key numbers only. No filler, no lengthy explanations. Every sentence must add value.
- Write in professional but accessible language suitable for an Indian mutual fund investor
- Use Indian currency format (e.g., "Rs 10,00,000" or "Rs 10 lakh")
- Include only the most important numbers — skip redundant or obvious data
- Provide 3-5 crisp, actionable recommendations — no lengthy rationale
- End with a one-line SEBI disclaimer: "Mutual fund investments are subject to market risks. Read all scheme documents carefully."
- Format using markdown: headers (##), bullet points, bold for key figures. No HTML tags
- Keep tone professional yet warm — concise does not mean cold

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

  // Wealth summary section
  if (data.wealthSummary) {
    const ws = data.wealthSummary
    prompt += `\n**Unified Wealth Summary:**
- Total Wealth: Rs ${ws.total_wealth.toLocaleString('en-IN')} (Invested: Rs ${ws.total_invested.toLocaleString('en-IN')})
- MF Portfolio: Rs ${ws.mf_current_value.toLocaleString('en-IN')}
- Household Assets: Rs ${ws.household_current_value.toLocaleString('en-IN')}
- Overall Gain: Rs ${ws.total_gain.toLocaleString('en-IN')}
`
    const breakdown = Object.entries(ws.asset_type_breakdown)
    if (breakdown.length > 0) {
      prompt += `- Asset Breakdown: ${breakdown.map(([type, d]) => `${type}: Rs ${Math.round(d.value).toLocaleString('en-IN')} (${d.count})`).join(', ')}\n`
    }
  }

  // Household assets detail
  if (data.householdAssets && data.householdAssets.length > 0) {
    prompt += `\n**Household Assets (Non-MF):**
${data.householdAssets.map(a => `- ${a.name} (${a.asset_type}) | Invested: Rs ${fmtRs(a.invested_amount)} | Current: Rs ${fmtRs(a.current_value)}${a.interest_rate ? ' | Rate: ' + a.interest_rate + '%' : ''}${a.maturity_date ? ' | Matures: ' + a.maturity_date : ''}`).join('\n')}
`
  }

  // Goal allocations
  if (data.goalAllocations && data.goalAllocations.length > 0) {
    prompt += `\n**Goal Asset Allocations:**
${data.goalAllocations.map(g => {
  const alloc = g.allocation
  const parts = Object.entries(alloc).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${typeof v === 'number' && v <= 1 ? (v * 100).toFixed(0) : v}%`)
  return `- ${g.goal_name}: ${parts.join(', ')}`
}).join('\n')}
`
  }

  // Household tax analysis
  if (data.householdTaxAnalysis && data.householdTaxAnalysis.length > 0) {
    prompt += `\n**Household Asset Tax Analysis (Budget 2024):**
${data.householdTaxAnalysis.map(a => `- ${a.name} (${a.asset_type}) | Gain: Rs ${fmtRs(a.gain)} | Tax: Rs ${fmtRs(a.tax_amount || 0)} | ${a.tax_type || 'N/A'}`).join('\n')}
- Total Household Asset Tax: Rs ${fmtRs(data.householdTaxTotal || 0)}
`
  }

  if (customInstructions) {
    prompt += `\n**Additional Instructions from Advisor:**
${customInstructions}
`
  }

  // Report-specific instructions (keep sections minimal)
  switch (reportType) {
    case 'portfolio_review':
      prompt += `\nGenerate a concise Portfolio Review with these sections ONLY:
1. Portfolio Snapshot (total value, gains, allocation — use a compact bullet list)
2. Key Observations & Action Items (top 3-5 points, what to do next)
3. Disclaimer (one line)`
      break
    case 'goal_progress':
      prompt += `\nGenerate a concise Goal Progress Report with these sections ONLY:
1. Goal Status (compact list: goal name, target, progress %, gap/surplus)
2. Action Items (what to adjust — SIP changes, rebalancing)
3. Disclaimer (one line)`
      break
    case 'tax_summary':
      prompt += `\nGenerate a concise Tax Summary with these sections ONLY:
1. Tax Position (STCG/LTCG totals, estimated tax liability — compact)
2. Recommendations (harvesting opportunities, tax-saving actions)
3. Disclaimer (one line)`
      break
    case 'comprehensive':
      prompt += `\nGenerate a concise Comprehensive Review with these sections ONLY:
1. Portfolio Snapshot (value, gains, allocation — compact)
2. Goals & Tax Summary (brief status of each, tax liability)
3. Priority Action Items (top 3-5 numbered recommendations)
4. Disclaimer (one line)`
      break
    case 'wealth_report':
      prompt += `\nGenerate a Comprehensive Wealth Report with these sections ONLY:
1. Wealth Overview (total wealth, MF vs non-MF split, gain)
2. Mutual Fund Portfolio (top holdings, allocation, performance summary)
3. Household Assets (key assets by type — FDs, stocks, real estate, gold, NPS, insurance)
4. Asset Allocation Assessment (diversification across asset classes, risk distribution)
5. Recommendations (rebalancing, consolidation, gaps in coverage — 3-5 crisp points)
6. Disclaimer (one line)`
      break
    case 'goal_allocation':
      prompt += `\nGenerate a Goal Progress Report with Allocation Breakdown with these sections ONLY:
1. Goal Status Overview (each goal: target, timeline, current progress, SIP adequacy)
2. Per-Goal Asset Allocation (for each goal, show the recommended allocation — equity MF, debt MF, stocks, FD, gold, PPF, NPS, ELSS etc.)
3. Allocation Rationale (brief: why this mix given horizon, risk profile, and tax efficiency)
4. Action Items (SIP adjustments, asset rebalancing per goal — 3-5 points)
5. Disclaimer (one line)`
      break
    case 'tax_planning':
      prompt += `\nGenerate a comprehensive Tax Planning Report with these sections ONLY:
1. MF Tax Position (equity STCG/LTCG, debt gains, estimated MF tax liability — compact)
2. Household Asset Tax (tax on FDs, stocks, real estate, gold, NPS etc. per Budget 2024 rules)
3. Combined Tax Summary (total estimated tax across MF + household assets)
4. Tax-Saving Strategies (harvesting, ELSS/PPF/NPS utilization, holding period optimization — 3-5 actionable points)
5. Disclaimer (one line)`
      break
  }

  return prompt
}

export default router
