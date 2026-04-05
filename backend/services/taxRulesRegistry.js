// Tax rules registry for all household asset types.
// Maps taxClass (from assetClassification.js) to Budget 2024 tax treatment.

import { getTaxClass } from '../utils/assetClassification.js'

const TAX_RULES = {
  equity: {
    label: 'Equity / Stocks',
    stcgRule: '20% flat rate',
    stcgRate: 0.20,
    ltcgRule: '12.5% above ₹1.25L annual exemption',
    ltcgRate: 0.125,
    holdingPeriodForLTCG: 12,
    holdingPeriodLabel: '> 12 months',
    exemptions: '₹1.25L annual LTCG exemption (Budget 2024)',
    ltcgExemption: 125000,
    incomeType: 'capital_gains',
  },
  debt_interest: {
    label: 'Fixed Deposits / Debt Interest',
    stcgRule: 'Interest taxed at slab rate',
    stcgRate: null,
    ltcgRule: 'Interest taxed at slab rate',
    ltcgRate: null,
    holdingPeriodForLTCG: null,
    holdingPeriodLabel: 'N/A (interest income)',
    exemptions: '₹40K TDS threshold (₹50K for senior citizens)',
    ltcgExemption: 0,
    incomeType: 'interest',
  },
  insurance: {
    label: 'Insurance',
    stcgRule: 'Taxed at slab rate if maturity < 2x annual premium',
    stcgRate: null,
    ltcgRule: 'Exempt under 10(10D) if sum assured > 10x premium',
    ltcgRate: null,
    holdingPeriodForLTCG: null,
    holdingPeriodLabel: 'Depends on policy type',
    exemptions: 'Sec 10(10D) exemption if sum assured > 10x annual premium',
    ltcgExemption: 0,
    incomeType: 'mixed',
  },
  real_estate: {
    label: 'Real Estate',
    stcgRule: 'Slab rate (holding < 2 years)',
    stcgRate: null,
    ltcgRule: '12.5% without indexation (Budget 2024)',
    ltcgRate: 0.125,
    holdingPeriodForLTCG: 24,
    holdingPeriodLabel: '> 2 years',
    exemptions: 'Sec 54/54F reinvestment exemption available',
    ltcgExemption: 0,
    incomeType: 'capital_gains',
  },
  exempt: {
    label: 'PPF / EPF (Exempt)',
    stcgRule: 'N/A',
    stcgRate: 0,
    ltcgRule: 'N/A',
    ltcgRate: 0,
    holdingPeriodForLTCG: null,
    holdingPeriodLabel: 'N/A',
    exemptions: 'EEE — Exempt-Exempt-Exempt (fully tax-free)',
    ltcgExemption: 0,
    incomeType: 'exempt',
  },
  nps: {
    label: 'NPS',
    stcgRule: 'N/A',
    stcgRate: 0,
    ltcgRule: '60% exempt on maturity, 40% annuity taxed at slab',
    ltcgRate: null,
    holdingPeriodForLTCG: null,
    holdingPeriodLabel: 'N/A',
    exemptions: '80CCD(1B) deduction ₹50K; 60% lump sum exempt on maturity',
    ltcgExemption: 0,
    incomeType: 'deferred',
  },
  gold: {
    label: 'Gold (Physical)',
    stcgRule: 'Slab rate (holding < 2 years)',
    stcgRate: null,
    ltcgRule: '12.5% without indexation (Budget 2024)',
    ltcgRate: 0.125,
    holdingPeriodForLTCG: 24,
    holdingPeriodLabel: '> 2 years',
    exemptions: 'No specific exemption',
    ltcgExemption: 0,
    incomeType: 'capital_gains',
  },
  gold_sgb: {
    label: 'Gold (SGB)',
    stcgRule: 'Slab rate (holding < 12 months)',
    stcgRate: null,
    ltcgRule: 'Exempt if held to maturity (8 years)',
    ltcgRate: 0.125,
    holdingPeriodForLTCG: 12,
    holdingPeriodLabel: '> 12 months (maturity = fully exempt)',
    exemptions: 'Full LTCG exemption on maturity redemption (8 years); interest taxed at slab',
    ltcgExemption: 0,
    incomeType: 'capital_gains',
    maturityMonths: 96,
  },
  other: {
    label: 'Other Assets',
    stcgRule: 'Slab rate',
    stcgRate: null,
    ltcgRule: 'Slab rate',
    ltcgRate: null,
    holdingPeriodForLTCG: 36,
    holdingPeriodLabel: '> 3 years',
    exemptions: 'None',
    ltcgExemption: 0,
    incomeType: 'capital_gains',
  },
}

export function getTaxRulesForClass(taxClass) {
  return TAX_RULES[taxClass] || TAX_RULES.other
}

export function getAllTaxRules() {
  return { ...TAX_RULES }
}

// Compute estimated tax for a single household asset.
// asset: { asset_type, invested_amount, estimated_value, purchase_date }
// slabRate: client's marginal tax rate (e.g. 0.30 for 30%)
export function computeAssetTax(asset, slabRate = 0.30) {
  const taxClass = getTaxClass(asset.asset_type)
  const rule = getTaxRulesForClass(taxClass)

  const invested = asset.invested_amount || 0
  const currentValue = asset.estimated_value || invested
  const gain = currentValue - invested

  let holdingMonths = 0
  if (asset.purchase_date) {
    const purchase = new Date(asset.purchase_date)
    const now = new Date()
    holdingMonths = (now.getFullYear() - purchase.getFullYear()) * 12 +
      (now.getMonth() - purchase.getMonth())
  }

  const result = {
    gain,
    gainPercent: invested > 0 ? ((gain / invested) * 100) : 0,
    holdingMonths,
    isLongTerm: false,
    gainType: 'STCG',
    taxRate: 0,
    taxableGain: 0,
    estimatedTax: 0,
    taxClass,
    rule,
    notes: [],
  }

  // Exempt assets (PPF, EPF)
  if (rule.incomeType === 'exempt') {
    result.gainType = 'Exempt'
    result.notes.push('EEE: Exempt-Exempt-Exempt — no tax applicable')
    return result
  }

  // Interest income (FD)
  if (rule.incomeType === 'interest') {
    const interestGain = Math.max(0, gain)
    result.gainType = 'Interest Income'
    result.taxRate = slabRate * 100
    result.taxableGain = interestGain
    result.estimatedTax = interestGain * slabRate
    result.notes.push('Interest income taxed at slab rate')
    if (interestGain > 40000) {
      result.notes.push('TDS applicable above ₹40,000 (₹50,000 for senior citizens)')
    }
    return result
  }

  // NPS — deferred taxation
  if (rule.incomeType === 'deferred') {
    const totalGain = Math.max(0, gain)
    result.gainType = 'Deferred (NPS)'
    result.taxableGain = totalGain * 0.4
    result.taxRate = slabRate * 100
    result.estimatedTax = result.taxableGain * slabRate
    result.notes.push('60% of corpus exempt on maturity; 40% annuity taxed at slab rate')
    result.notes.push('80CCD(1B) deduction of ₹50,000 available on contributions')
    return result
  }

  // Insurance — typically exempt
  if (rule.incomeType === 'mixed') {
    result.gainType = 'Insurance'
    result.notes.push('Most life insurance maturity proceeds are exempt under Sec 10(10D)')
    result.notes.push('Verify: sum assured must be > 10x annual premium for exemption')
    return result
  }

  // Capital gains treatment (equity, real_estate, gold, gold_sgb, other)
  if (rule.holdingPeriodForLTCG != null) {
    result.isLongTerm = holdingMonths >= rule.holdingPeriodForLTCG
  }

  // SGB maturity — fully exempt
  if (taxClass === 'gold_sgb' && rule.maturityMonths && holdingMonths >= rule.maturityMonths) {
    result.isLongTerm = true
    result.gainType = 'Exempt (SGB Maturity)'
    result.notes.push('SGB held to maturity — LTCG fully exempt')
    return result
  }

  result.gainType = result.isLongTerm ? 'LTCG' : 'STCG'

  if (gain <= 0) {
    result.notes.push(gain < 0 ? 'Unrealized loss — potential harvesting opportunity' : 'No gain')
    return result
  }

  if (result.isLongTerm) {
    if (rule.ltcgRate != null) {
      let taxableGain = gain
      if (rule.ltcgExemption > 0) {
        taxableGain = Math.max(0, gain - rule.ltcgExemption)
        if (gain > rule.ltcgExemption) {
          result.notes.push(`₹${(rule.ltcgExemption / 100000).toFixed(2)}L exemption applied`)
        }
      }
      result.taxRate = rule.ltcgRate * 100
      result.taxableGain = taxableGain
      result.estimatedTax = taxableGain * rule.ltcgRate
    } else {
      result.taxRate = slabRate * 100
      result.taxableGain = gain
      result.estimatedTax = gain * slabRate
      result.notes.push('LTCG taxed at slab rate')
    }
  } else {
    if (rule.stcgRate != null) {
      result.taxRate = rule.stcgRate * 100
      result.taxableGain = gain
      result.estimatedTax = gain * rule.stcgRate
    } else {
      result.taxRate = slabRate * 100
      result.taxableGain = gain
      result.estimatedTax = gain * slabRate
      result.notes.push('STCG taxed at slab rate')
    }
  }

  if (taxClass === 'real_estate' && result.isLongTerm) {
    result.notes.push('Sec 54/54F reinvestment exemption may reduce tax further')
  }

  return result
}
