import { Router } from 'express'
import { getDb } from '../db/index.js'
import { batchPrefetchNavs } from '../services/navCache.js'
import { getNavOnDate } from '../services/calculations.js'

const router = Router()

// ---- Tax Rate Constants (Budget 2024 rules) ----
// Equity funds: held >= 12 months = LTCG at 12.5% (exempt up to ₹1.25L/year)
//               held < 12 months  = STCG at 20%
// Debt funds (purchased after Apr 2023): all gains taxed at slab rate (assume 30% for conservative estimate)
// Hybrid: if equity >= 65%, treated as equity; else debt
const TAX_RATES = {
  equity: { stcg: 20, ltcg: 12.5, ltcgExemption: 125000, holdingPeriod: 12 },
  debt: { stcg: 30, ltcg: 30, ltcgExemption: 0, holdingPeriod: 36 },
}

// Determine if a fund is equity-oriented based on its category
function isEquityFund(category) {
  if (!category) return false
  const lower = category.toLowerCase()
  return (
    lower.includes('equity') || lower.includes('large cap') || lower.includes('mid cap') ||
    lower.includes('small cap') || lower.includes('flexi cap') || lower.includes('multi cap') ||
    lower.includes('elss') || lower.includes('value') || lower.includes('contra') ||
    lower.includes('focused') || lower.includes('dividend yield') || lower.includes('sectoral') ||
    lower.includes('thematic') || lower.includes('index') || lower.includes('etf') ||
    // Hybrid equity-oriented
    lower.includes('aggressive hybrid') || lower.includes('balanced advantage') ||
    lower.includes('equity savings')
  )
}

// GET /api/tax/:clientId/analysis — full tax analysis for a client's holdings
router.get('/tax/:clientId/analysis', async (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  const holdings = db.prepare(
    'SELECT * FROM client_holdings WHERE client_id = ?'
  ).all(req.params.clientId)

  if (holdings.length === 0) {
    return res.json({
      client,
      holdings: [],
      summary: emptySummary(),
      harvestingOpportunities: [],
    })
  }

  // Batch-fetch NAV data for all holdings
  const schemeCodes = [...new Set(holdings.map(h => h.scheme_code))]
  const navDataMap = await batchPrefetchNavs(schemeCodes)

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Analyze each holding
  const analyzed = holdings.map(h => {
    const fundInfo = db.prepare('SELECT * FROM funds WHERE scheme_code = ?').get(h.scheme_code)
    const category = fundInfo?.scheme_category || ''
    const amc = fundInfo?.amc || ''
    const equity = isEquityFund(category)
    const taxType = equity ? 'equity' : 'debt'
    const rates = TAX_RATES[taxType]

    const navData = navDataMap[h.scheme_code] || []

    // Determine purchase NAV
    let purchaseNav = null
    let currentNav = null
    let units = h.units

    if (navData.length > 0) {
      currentNav = navData[navData.length - 1].nav

      if (h.purchase_date) {
        const pNav = getNavOnDate(navData, h.purchase_date)
        if (pNav) purchaseNav = pNav.nav
      }

      // If no units, estimate from invested amount + purchase NAV
      if (!units && purchaseNav && purchaseNav > 0) {
        units = h.invested_amount / purchaseNav
      }
    }

    // Fallback: use fund table NAV
    if (!currentNav && fundInfo?.nav) currentNav = fundInfo.nav
    if (!purchaseNav && h.invested_amount > 0 && units) {
      purchaseNav = h.invested_amount / units
    }

    const currentValue = units && currentNav ? units * currentNav : h.invested_amount
    const gain = currentValue - h.invested_amount
    const gainPercent = h.invested_amount > 0 ? (gain / h.invested_amount) * 100 : 0

    // Holding period in months
    let holdingMonths = 0
    if (h.purchase_date) {
      const purchaseDate = new Date(h.purchase_date)
      holdingMonths = (today.getFullYear() - purchaseDate.getFullYear()) * 12 +
        (today.getMonth() - purchaseDate.getMonth())
    }

    const isLongTerm = holdingMonths >= rates.holdingPeriod
    const gainType = isLongTerm ? 'LTCG' : 'STCG'
    const taxRate = isLongTerm ? rates.ltcg : rates.stcg

    // Tax liability (only on gains, not losses)
    let taxableGain = Math.max(0, gain)
    // LTCG exemption applies per financial year across all equity holdings — handled at summary level
    const estimatedTax = taxableGain > 0 ? (taxableGain * taxRate / 100) : 0

    return {
      id: h.id,
      scheme_code: h.scheme_code,
      scheme_name: h.scheme_name || fundInfo?.scheme_name || h.scheme_code,
      category,
      amc,
      fundType: equity ? 'Equity' : 'Debt',
      invested_amount: h.invested_amount,
      currentValue: Math.round(currentValue),
      units: units ? parseFloat(units.toFixed(3)) : null,
      purchaseNav,
      currentNav,
      purchase_date: h.purchase_date,
      gain: Math.round(gain),
      gainPercent: Math.round(gainPercent * 100) / 100,
      holdingMonths,
      holdingPeriodLabel: holdingMonths >= 12 ? `${Math.floor(holdingMonths / 12)}y ${holdingMonths % 12}m` : `${holdingMonths}m`,
      isLongTerm,
      gainType,
      taxRate,
      taxableGain: Math.round(taxableGain),
      estimatedTax: Math.round(estimatedTax),
    }
  })

  // Summary calculations
  const summary = calculateSummary(analyzed)

  // Tax-loss harvesting opportunities
  const harvestingOpportunities = analyzed
    .filter(h => h.gain < 0 && h.holdingMonths > 0)
    .map(h => ({
      id: h.id,
      scheme_code: h.scheme_code,
      scheme_name: h.scheme_name,
      category: h.category,
      fundType: h.fundType,
      invested: h.invested_amount,
      currentValue: h.currentValue,
      loss: Math.abs(h.gain),
      holdingPeriodLabel: h.holdingPeriodLabel,
      isLongTerm: h.isLongTerm,
      // Potential tax saved by booking this loss
      potentialTaxSaved: Math.round(Math.abs(h.gain) * (h.isLongTerm ? TAX_RATES[h.fundType.toLowerCase()].ltcg : TAX_RATES[h.fundType.toLowerCase()].stcg) / 100),
    }))
    .sort((a, b) => b.potentialTaxSaved - a.potentialTaxSaved)

  res.json({
    client,
    holdings: analyzed,
    summary,
    harvestingOpportunities,
  })
})

// POST /api/tax/estimate — standalone tax estimator (no client needed)
router.post('/tax/estimate', (req, res) => {
  const { invested, current_value, holding_months, fund_type } = req.body
  if (invested == null || current_value == null) {
    return res.status(400).json({ message: 'invested and current_value are required' })
  }

  const type = (fund_type || 'equity').toLowerCase()
  const rates = TAX_RATES[type] || TAX_RATES.equity
  const months = holding_months || 0
  const isLongTerm = months >= rates.holdingPeriod
  const gain = current_value - invested
  const taxableGain = Math.max(0, gain)
  const taxRate = isLongTerm ? rates.ltcg : rates.stcg
  const estimatedTax = Math.round(taxableGain * taxRate / 100)

  res.json({
    gain: Math.round(gain),
    gainType: isLongTerm ? 'LTCG' : 'STCG',
    taxRate,
    taxableGain: Math.round(taxableGain),
    estimatedTax,
    isLongTerm,
    ltcgExemptionNote: isLongTerm && type === 'equity'
      ? `Equity LTCG is exempt up to ₹1,25,000 per financial year. Applied at portfolio level.`
      : null,
  })
})

function emptySummary() {
  return {
    totalInvested: 0,
    totalCurrentValue: 0,
    totalGain: 0,
    totalSTCG: 0,
    totalLTCG: 0,
    equitySTCG: 0,
    equityLTCG: 0,
    debtSTCG: 0,
    debtLTCG: 0,
    ltcgExemption: TAX_RATES.equity.ltcgExemption,
    equityLTCGAfterExemption: 0,
    estimatedTotalTax: 0,
    totalUnrealizedLoss: 0,
    potentialHarvestingSavings: 0,
  }
}

function calculateSummary(holdings) {
  let totalInvested = 0, totalCurrentValue = 0
  let equitySTCG = 0, equityLTCG = 0, debtSTCG = 0, debtLTCG = 0
  let totalUnrealizedLoss = 0

  for (const h of holdings) {
    totalInvested += h.invested_amount
    totalCurrentValue += h.currentValue

    if (h.gain > 0) {
      if (h.fundType === 'Equity') {
        if (h.isLongTerm) equityLTCG += h.gain
        else equitySTCG += h.gain
      } else {
        if (h.isLongTerm) debtLTCG += h.gain
        else debtSTCG += h.gain
      }
    } else if (h.gain < 0) {
      totalUnrealizedLoss += Math.abs(h.gain)
    }
  }

  const totalGain = totalCurrentValue - totalInvested

  // Apply equity LTCG exemption (₹1.25L per FY)
  const ltcgExemption = TAX_RATES.equity.ltcgExemption
  const equityLTCGAfterExemption = Math.max(0, equityLTCG - ltcgExemption)

  // Calculate tax
  const equitySTCGTax = Math.round(equitySTCG * TAX_RATES.equity.stcg / 100)
  const equityLTCGTax = Math.round(equityLTCGAfterExemption * TAX_RATES.equity.ltcg / 100)
  const debtSTCGTax = Math.round(debtSTCG * TAX_RATES.debt.stcg / 100)
  const debtLTCGTax = Math.round(debtLTCG * TAX_RATES.debt.ltcg / 100)
  const estimatedTotalTax = equitySTCGTax + equityLTCGTax + debtSTCGTax + debtLTCGTax

  // Potential savings from harvesting losses
  // Losses can offset gains of the same type (STCG offsets STCG, LTCG offsets LTCG)
  const potentialHarvestingSavings = holdings
    .filter(h => h.gain < 0)
    .reduce((sum, h) => {
      const rate = h.isLongTerm
        ? TAX_RATES[h.fundType.toLowerCase()].ltcg
        : TAX_RATES[h.fundType.toLowerCase()].stcg
      return sum + Math.round(Math.abs(h.gain) * rate / 100)
    }, 0)

  return {
    totalInvested: Math.round(totalInvested),
    totalCurrentValue: Math.round(totalCurrentValue),
    totalGain: Math.round(totalGain),
    totalSTCG: Math.round(equitySTCG + debtSTCG),
    totalLTCG: Math.round(equityLTCG + debtLTCG),
    equitySTCG: Math.round(equitySTCG),
    equityLTCG: Math.round(equityLTCG),
    debtSTCG: Math.round(debtSTCG),
    debtLTCG: Math.round(debtLTCG),
    ltcgExemption,
    equityLTCGAfterExemption: Math.round(equityLTCGAfterExemption),
    equitySTCGTax,
    equityLTCGTax,
    debtSTCGTax,
    debtLTCGTax,
    estimatedTotalTax,
    totalUnrealizedLoss: Math.round(totalUnrealizedLoss),
    potentialHarvestingSavings,
  }
}

export default router
