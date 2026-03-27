import { useState, useEffect } from 'react'
import {
  Calculator, Loader2, TrendingDown, TrendingUp, AlertTriangle,
  Scissors, IndianRupee, Clock, ShieldCheck, ChevronDown, ChevronUp, X
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { useToast } from '../components/Toast'
import * as api from '../services/api'
import { formatCurrency, formatPercent } from '../lib/utils'

const PIE_COLORS = ['#D4A847', '#1B2A4A', '#10b981', '#ef4444']

export default function TaxOptimizer() {
  const { showToast } = useToast()
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showEstimator, setShowEstimator] = useState(false)

  useEffect(() => {
    api.getClients().then(setClients).catch(err => showToast(err.message, 'error'))
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setAnalysis(null)
      return
    }
    setLoading(true)
    api.getTaxAnalysis(selectedClientId)
      .then(setAnalysis)
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [selectedClientId])

  return (
    <div className="p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A] flex items-center gap-2">
            <Calculator className="text-[#D4A847]" /> Tax Optimization Dashboard
          </h1>
          <p className="text-gray-500 mt-1">LTCG/STCG analysis, tax liability estimates, and harvesting suggestions</p>
        </div>
        <button
          onClick={() => setShowEstimator(!showEstimator)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]/90 transition-colors"
        >
          <Calculator size={16} /> Quick Estimator
        </button>
      </div>

      {/* Quick Tax Estimator */}
      {showEstimator && <TaxEstimator onClose={() => setShowEstimator(false)} />}

      {/* Client Selector */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Select Client</label>
            <select
              value={selectedClientId || ''}
              onChange={(e) => setSelectedClientId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847]"
            >
              <option value="">Choose a client...</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Analyzing tax implications...
        </div>
      )}

      {/* Empty state */}
      {selectedClientId && !loading && analysis && analysis.holdings.length === 0 && (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-xl shadow-sm">
          <Calculator size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">No holdings found. Add holdings in Portfolio X-Ray first.</p>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && analysis.holdings.length > 0 && (
        <TaxAnalysisView analysis={analysis} />
      )}

      {/* Disclaimer */}
      {analysis && analysis.holdings.length > 0 && (
        <div className="mt-6 bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Tax calculations are based on Budget 2024 rates (Equity STCG: 20%, Equity LTCG: 12.5% above {'\u20B9'}1,25,000,
            Debt: at slab rate assumed 30%). Actual tax liability depends on your income slab, grandfathering provisions,
            and other factors. This is for indicative purposes only — consult a qualified tax professional for exact
            calculations. Mutual fund investments are subject to market risks.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------- Tax Analysis View ----------
function TaxAnalysisView({ analysis }) {
  const { summary, holdings, harvestingOpportunities } = analysis
  const [expandedRow, setExpandedRow] = useState(null)

  // Prepare chart data
  const gainBreakdown = [
    { name: 'Equity STCG', value: summary.equitySTCG, tax: summary.equitySTCGTax },
    { name: 'Equity LTCG', value: summary.equityLTCGAfterExemption, tax: summary.equityLTCGTax },
    { name: 'Debt STCG', value: summary.debtSTCG, tax: summary.debtSTCGTax },
    { name: 'Debt LTCG', value: summary.debtLTCG, tax: summary.debtLTCGTax },
  ].filter(d => d.value > 0 || d.tax > 0)

  const holdingTypeSplit = [
    { name: 'STCG', value: holdings.filter(h => !h.isLongTerm).length },
    { name: 'LTCG', value: holdings.filter(h => h.isLongTerm).length },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Gain/Loss"
          value={formatCurrency(Math.abs(summary.totalGain))}
          prefix={summary.totalGain >= 0 ? '+' : '-'}
          color={summary.totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}
          icon={summary.totalGain >= 0 ? TrendingUp : TrendingDown}
        />
        <SummaryCard
          label="Estimated Tax"
          value={formatCurrency(summary.estimatedTotalTax)}
          color="text-red-500"
          icon={IndianRupee}
        />
        <SummaryCard
          label="Unrealized Losses"
          value={formatCurrency(summary.totalUnrealizedLoss)}
          color="text-amber-600"
          icon={TrendingDown}
        />
        <SummaryCard
          label="Harvest Savings"
          value={formatCurrency(summary.potentialHarvestingSavings)}
          color="text-emerald-600"
          icon={Scissors}
        />
      </div>

      {/* Tax Breakdown Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Detailed breakdown */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide flex items-center gap-2">
            <IndianRupee size={14} /> Tax Breakdown
          </h3>
          <div className="space-y-3">
            <TaxRow label="Equity STCG" gain={summary.equitySTCG} rate="20%" tax={summary.equitySTCGTax} />
            <TaxRow
              label="Equity LTCG"
              gain={summary.equityLTCG}
              rate="12.5%"
              tax={summary.equityLTCGTax}
              note={summary.equityLTCG > 0 ? `Exempt: ${formatCurrency(Math.min(summary.equityLTCG, summary.ltcgExemption))} | Taxable: ${formatCurrency(summary.equityLTCGAfterExemption)}` : null}
            />
            <TaxRow label="Debt STCG" gain={summary.debtSTCG} rate="30% (slab)" tax={summary.debtSTCGTax} />
            <TaxRow label="Debt LTCG" gain={summary.debtLTCG} rate="30% (slab)" tax={summary.debtLTCGTax} />
            <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
              <span className="text-sm font-bold text-[#1B2A4A]">Total Estimated Tax</span>
              <span className="text-lg font-bold text-red-500">{formatCurrency(summary.estimatedTotalTax)}</span>
            </div>
          </div>
        </div>

        {/* Gain Type Chart */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide flex items-center gap-2">
            <Clock size={14} /> Gain Type Distribution
          </h3>
          {gainBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gainBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : `${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="value" fill="#D4A847" name="Taxable Gain" radius={[0, 4, 4, 0]} />
                <Bar dataKey="tax" fill="#ef4444" name="Tax" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-gray-300 text-sm">
              No taxable gains
            </div>
          )}
        </div>
      </div>

      {/* LTCG Exemption Callout */}
      {summary.equityLTCG > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Equity LTCG Exemption Applied</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {'\u20B9'}1,25,000 per financial year is exempt from equity LTCG tax.
              Your equity LTCG of {formatCurrency(summary.equityLTCG)} has been reduced to {formatCurrency(summary.equityLTCGAfterExemption)} after exemption.
            </p>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-[#1B2A4A] uppercase tracking-wide">Holding-wise Tax Analysis</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left p-3 text-gray-400 font-medium">Fund</th>
                <th className="text-right p-3 text-gray-400 font-medium">Invested</th>
                <th className="text-right p-3 text-gray-400 font-medium">Current</th>
                <th className="text-right p-3 text-gray-400 font-medium">Gain/Loss</th>
                <th className="text-center p-3 text-gray-400 font-medium">Type</th>
                <th className="text-center p-3 text-gray-400 font-medium">Period</th>
                <th className="text-right p-3 text-gray-400 font-medium">Est. Tax</th>
                <th className="w-8 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  expanded={expandedRow === h.id}
                  onToggle={() => setExpandedRow(expandedRow === h.id ? null : h.id)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                <td className="p-3 text-[#1B2A4A]">Total</td>
                <td className="p-3 text-right">{formatCurrency(summary.totalInvested)}</td>
                <td className="p-3 text-right">{formatCurrency(summary.totalCurrentValue)}</td>
                <td className={`p-3 text-right ${summary.totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {summary.totalGain >= 0 ? '+' : ''}{formatCurrency(Math.abs(summary.totalGain))}
                </td>
                <td colSpan={2}></td>
                <td className="p-3 text-right text-red-500">{formatCurrency(summary.estimatedTotalTax)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Tax-Loss Harvesting */}
      {harvestingOpportunities.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-amber-800 mb-2 uppercase tracking-wide flex items-center gap-2">
            <Scissors size={14} /> Tax-Loss Harvesting Opportunities
          </h3>
          <p className="text-xs text-amber-600 mb-4">
            These holdings have unrealized losses. Booking them can offset your capital gains and reduce your tax liability.
          </p>
          <div className="space-y-3">
            {harvestingOpportunities.map(h => (
              <div key={h.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1B2A4A] truncate">{h.scheme_name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {h.fundType} &middot; {h.category} &middot; Held {h.holdingPeriodLabel}
                  </p>
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="text-sm font-bold text-red-500">-{formatCurrency(h.loss)}</p>
                  <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                    Save up to {formatCurrency(h.potentialTaxSaved)} in tax
                  </p>
                </div>
              </div>
            ))}
            <div className="bg-white rounded-lg p-3 text-center border border-amber-200">
              <p className="text-xs text-amber-700 font-medium">
                Total potential tax savings: <span className="text-emerald-600 font-bold">{formatCurrency(summary.potentialHarvestingSavings)}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No harvesting message */}
      {harvestingOpportunities.length === 0 && summary.totalGain > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800">No Harvesting Opportunities</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              All holdings are in profit. No tax-loss harvesting is applicable at this time.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Sub-components ----------

function SummaryCard({ label, value, color = 'text-[#1B2A4A]', prefix = '', icon: Icon }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase">{label}</p>
          <p className={`text-xl font-bold mt-1 ${color}`}>{prefix}{value}</p>
        </div>
        {Icon && <div className="p-2 rounded-lg bg-gray-50"><Icon size={18} className="text-gray-400" /></div>}
      </div>
    </div>
  )
}

function TaxRow({ label, gain, rate, tax, note }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm text-[#1B2A4A] font-medium">{label}</p>
        {note && <p className="text-[10px] text-gray-400 mt-0.5">{note}</p>}
      </div>
      <div className="text-right flex items-center gap-4">
        <span className="text-xs text-gray-400">{formatCurrency(gain)} @ {rate}</span>
        <span className={`text-sm font-semibold ${tax > 0 ? 'text-red-500' : 'text-gray-300'}`}>{formatCurrency(tax)}</span>
      </div>
    </div>
  )
}

function HoldingRow({ holding: h, expanded, onToggle }) {
  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={onToggle}>
        <td className="p-3">
          <p className="font-medium text-[#1B2A4A] truncate max-w-[200px]">{h.scheme_name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{h.fundType} &middot; {h.category}</p>
        </td>
        <td className="p-3 text-right">{formatCurrency(h.invested_amount)}</td>
        <td className="p-3 text-right">{formatCurrency(h.currentValue)}</td>
        <td className={`p-3 text-right font-medium ${h.gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {h.gain >= 0 ? '+' : ''}{formatCurrency(Math.abs(h.gain))}
        </td>
        <td className="p-3 text-center">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            h.isLongTerm ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {h.gainType}
          </span>
        </td>
        <td className="p-3 text-center text-xs text-gray-500">{h.holdingPeriodLabel}</td>
        <td className={`p-3 text-right font-medium ${h.estimatedTax > 0 ? 'text-red-500' : 'text-gray-300'}`}>
          {formatCurrency(h.estimatedTax)}
        </td>
        <td className="p-3 text-gray-300">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={8} className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-gray-400 uppercase font-medium">Purchase Date</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5">{h.purchase_date || '\u2014'}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">Purchase NAV</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5">{h.purchaseNav ? `\u20B9${h.purchaseNav.toFixed(2)}` : '\u2014'}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">Current NAV</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5">{h.currentNav ? `\u20B9${h.currentNav.toFixed(2)}` : '\u2014'}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">Units</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5">{h.units ?? '\u2014'}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">Holding Period</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5">{h.holdingMonths} months ({h.isLongTerm ? 'Long-term' : 'Short-term'})</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">Tax Rate</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5">{h.taxRate}%</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">Gain %</p>
                <p className={`font-medium mt-0.5 ${h.gainPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatPercent(h.gainPercent)}</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase font-medium">AMC</p>
                <p className="text-[#1B2A4A] font-medium mt-0.5 truncate">{h.amc || '\u2014'}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ---------- Quick Tax Estimator ----------
function TaxEstimator({ onClose }) {
  const { showToast } = useToast()
  const [form, setForm] = useState({
    invested: 100000,
    current_value: 130000,
    holding_months: 18,
    fund_type: 'equity',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleEstimate = async () => {
    setLoading(true)
    try {
      const data = await api.estimateTax(form)
      setResult(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#1B2A4A]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Calculator size={16} className="text-[#D4A847]" /> Quick Tax Estimator
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Invested ({'\u20B9'})</label>
            <input type="number" value={form.invested} onChange={e => set('invested', parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Current Value ({'\u20B9'})</label>
            <input type="number" value={form.current_value} onChange={e => set('current_value', parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Holding (months)</label>
            <input type="number" value={form.holding_months} onChange={e => set('holding_months', parseInt(e.target.value) || 0)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Fund Type</label>
            <select value={form.fund_type} onChange={e => set('fund_type', e.target.value)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40">
              <option value="equity">Equity</option>
              <option value="debt">Debt</option>
            </select>
          </div>
        </div>
        <button onClick={handleEstimate} disabled={loading} className="px-5 py-2 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors">
          {loading ? 'Calculating...' : 'Estimate Tax'}
        </button>

        {result && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-gray-50">
              <p className="text-[10px] text-gray-400 uppercase">Gain</p>
              <p className={`text-lg font-bold mt-1 ${result.gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {result.gain >= 0 ? '+' : ''}{formatCurrency(Math.abs(result.gain))}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50">
              <p className="text-[10px] text-gray-400 uppercase">Type</p>
              <p className="text-lg font-bold mt-1 text-[#1B2A4A]">{result.gainType}</p>
              <p className="text-[10px] text-gray-400">@ {result.taxRate}%</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50">
              <p className="text-[10px] text-gray-400 uppercase">Estimated Tax</p>
              <p className="text-lg font-bold mt-1 text-red-500">{formatCurrency(result.estimatedTax)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-emerald-50">
              <p className="text-[10px] text-gray-400 uppercase">Net Gain</p>
              <p className="text-lg font-bold mt-1 text-emerald-600">
                {formatCurrency(Math.max(0, result.gain - result.estimatedTax))}
              </p>
            </div>
            {result.ltcgExemptionNote && (
              <div className="col-span-full text-[10px] text-emerald-600 bg-emerald-50 rounded-lg p-2 text-center">
                {result.ltcgExemptionNote}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
