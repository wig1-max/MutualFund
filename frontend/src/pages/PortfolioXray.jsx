import { useState, useEffect } from 'react'
import {
  PieChart as PieChartIcon, Plus, Trash2, Loader2, AlertTriangle,
  TrendingDown, Building2, Layers, BarChart3, ChevronRight, X
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useToast } from '../components/Toast'
import FundSearch from '../components/FundSearch'
import * as api from '../services/api'
import { formatCurrency, formatPercent } from '../lib/utils'

const PIE_COLORS = ['#1B2A4A', '#D4A847', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export default function PortfolioXray() {
  const { showToast } = useToast()
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [showAddHolding, setShowAddHolding] = useState(false)

  useEffect(() => {
    api.getClients().then(setClients).catch(err => showToast(err.message, 'error'))
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setHoldings([])
      setAnalysis(null)
      return
    }
    setLoading(true)
    api.getPortfolio(selectedClientId)
      .then(data => setHoldings(data.holdings))
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [selectedClientId])

  const handleAddHolding = async (fund, amount, units, purchaseDate) => {
    if (!selectedClientId) return
    try {
      await api.addHolding(selectedClientId, {
        scheme_code: fund.scheme_code,
        scheme_name: fund.scheme_name,
        invested_amount: parseFloat(amount),
        units: units ? parseFloat(units) : null,
        purchase_date: purchaseDate || null,
      })
      const data = await api.getPortfolio(selectedClientId)
      setHoldings(data.holdings)
      setShowAddHolding(false)
      setAnalysis(null)
      showToast('Holding added', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDeleteHolding = async (holdingId) => {
    if (!window.confirm('Remove this holding?')) return
    try {
      await api.deleteHolding(selectedClientId, holdingId)
      setHoldings(holdings.filter(h => h.id !== holdingId))
      setAnalysis(null)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleAnalyze = async () => {
    if (!selectedClientId) return
    setAnalyzing(true)
    try {
      const data = await api.getPortfolioAnalysis(selectedClientId)
      setAnalysis(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A] flex items-center gap-2">
            <PieChartIcon className="text-[#D4A847]" /> Portfolio X-Ray
          </h1>
          <p className="text-gray-500 mt-1">Analyze client portfolios for overlap, concentration, and underperformers</p>
        </div>
      </div>

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
          {selectedClientId && (
            <div className="flex gap-2 pt-5">
              <button
                onClick={() => setShowAddHolding(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]/90 transition-colors"
              >
                <Plus size={16} /> Add Holding
              </button>
              {holdings.length > 0 && (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors"
                >
                  {analyzing ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                  {analyzing ? 'Analyzing...' : 'Analyze Portfolio'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Holding Modal */}
      {showAddHolding && (
        <AddHoldingModal onAdd={handleAddHolding} onClose={() => setShowAddHolding(false)} />
      )}

      {/* Holdings List (pre-analysis) */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading holdings...
        </div>
      ) : selectedClientId && holdings.length === 0 && !analysis ? (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-xl shadow-sm">
          <PieChartIcon size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">No holdings added yet. Click "Add Holding" to start building the portfolio.</p>
        </div>
      ) : holdings.length > 0 && !analysis ? (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left p-4 text-gray-400 font-medium">Fund</th>
                <th className="text-right p-4 text-gray-400 font-medium">Invested</th>
                <th className="text-right p-4 text-gray-400 font-medium">Units</th>
                <th className="text-right p-4 text-gray-400 font-medium">Purchase Date</th>
                <th className="text-right p-4 text-gray-400 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-4">
                    <p className="font-medium text-[#1B2A4A] truncate max-w-xs">{h.scheme_name || h.scheme_code}</p>
                  </td>
                  <td className="p-4 text-right font-medium">{formatCurrency(h.invested_amount)}</td>
                  <td className="p-4 text-right text-gray-500">{h.units ? h.units.toFixed(3) : '\u2014'}</td>
                  <td className="p-4 text-right text-gray-500">{h.purchase_date || '\u2014'}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleDeleteHolding(h.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Analysis Results */}
      {analysis && <AnalysisView analysis={analysis} onDeleteHolding={handleDeleteHolding} />}
    </div>
  )
}

// ---------- Add Holding Modal ----------
function AddHoldingModal({ onAdd, onClose }) {
  const [fund, setFund] = useState(null)
  const [amount, setAmount] = useState('')
  const [units, setUnits] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fund || !amount) return
    setSaving(true)
    await onAdd(fund, amount, units, purchaseDate)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1B2A4A]">Add Holding</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Fund *</label>
            <FundSearch onSelect={setFund} placeholder="Search mutual fund..." />
            {fund && <p className="text-xs text-[#D4A847] mt-1 truncate">{fund.scheme_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Invested Amount ({'\u20B9'}) *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100000" required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Units (optional)</label>
              <input type="number" step="0.001" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="e.g. 523.456" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Purchase Date (optional)</label>
            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" disabled={!fund || !amount || saving} className="flex items-center gap-2 px-5 py-2 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Holding
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------- Analysis View ----------
function AnalysisView({ analysis, onDeleteHolding }) {
  const { summary, holdings, allocation, amcConcentration, overlap, underperformers } = analysis

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Invested" value={formatCurrency(summary.totalInvested)} />
        <SummaryCard label="Current Value" value={formatCurrency(summary.currentValue)} color={summary.gain >= 0 ? 'text-emerald-600' : 'text-red-500'} />
        <SummaryCard label="Total Gain" value={formatCurrency(Math.abs(summary.gain))} prefix={summary.gain >= 0 ? '+' : '-'} color={summary.gain >= 0 ? 'text-emerald-600' : 'text-red-500'} />
        <SummaryCard label="Return" value={formatPercent(summary.gainPercent)} color={summary.gainPercent >= 0 ? 'text-emerald-600' : 'text-red-500'} />
      </div>

      {/* Holdings Table with Returns */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-x-auto">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-[#1B2A4A] uppercase tracking-wide">Holdings Detail</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left p-3 text-gray-400 font-medium">Fund</th>
              <th className="text-right p-3 text-gray-400 font-medium">Invested</th>
              <th className="text-right p-3 text-gray-400 font-medium">Current</th>
              <th className="text-right p-3 text-gray-400 font-medium">Gain</th>
              <th className="text-right p-3 text-gray-400 font-medium">1Y</th>
              <th className="text-right p-3 text-gray-400 font-medium">3Y</th>
              <th className="text-right p-3 text-gray-400 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="p-3">
                  <p className="font-medium text-[#1B2A4A] truncate max-w-[200px]">{h.scheme_name || h.scheme_code}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{h.category}{h.amc ? ` \u00B7 ${h.amc}` : ''}</p>
                </td>
                <td className="p-3 text-right">{formatCurrency(h.invested_amount)}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(h.currentValue)}</td>
                <td className={`p-3 text-right font-medium ${h.gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {formatPercent(h.gainPercent)}
                </td>
                <td className={`p-3 text-right ${h.returns?.['1Y'] != null ? (h.returns['1Y'] >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-300'}`}>
                  {h.returns?.['1Y'] != null ? formatPercent(h.returns['1Y']) : '\u2014'}
                </td>
                <td className={`p-3 text-right ${h.returns?.['3Y'] != null ? (h.returns['3Y'] >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-300'}`}>
                  {h.returns?.['3Y'] != null ? formatPercent(h.returns['3Y']) : '\u2014'}
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => onDeleteHolding(h.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asset Allocation Pie */}
        {allocation.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide flex items-center gap-2">
              <PieChartIcon size={14} /> Asset Allocation
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={allocation}
                  dataKey="value"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ category, percent }) => `${category} ${percent.toFixed(1)}%`}
                  labelLine={true}
                >
                  {allocation.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* AMC Concentration */}
        {amcConcentration.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide flex items-center gap-2">
              <Building2 size={14} /> AMC Concentration
            </h3>
            <div className="space-y-3">
              {amcConcentration.map((item, i) => (
                <div key={item.amc}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium truncate mr-2">{item.amc}</span>
                    <span className={`font-semibold ${item.percent > 50 ? 'text-red-500' : item.percent > 30 ? 'text-amber-600' : 'text-[#1B2A4A]'}`}>
                      {item.percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(item.percent, 100)}%`,
                        backgroundColor: item.percent > 50 ? '#ef4444' : item.percent > 30 ? '#f59e0b' : PIE_COLORS[i % PIE_COLORS.length]
                      }}
                    />
                  </div>
                  {item.percent > 50 && (
                    <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={10} /> High concentration — consider diversifying
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Overlap Analysis */}
      {overlap.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide flex items-center gap-2">
            <Layers size={14} /> Holdings Overlap
          </h3>
          <p className="text-xs text-gray-400 mb-4">Funds with common top holdings — you may be paying double expense ratio for similar exposure.</p>
          <div className="space-y-4">
            {overlap.map((o, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1B2A4A] truncate">{o.fund1.name}</p>
                    <p className="text-[10px] text-gray-400">vs</p>
                    <p className="text-xs font-medium text-[#1B2A4A] truncate">{o.fund2.name}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className={`text-lg font-bold ${o.overlapPercent > 60 ? 'text-red-500' : o.overlapPercent > 40 ? 'text-amber-600' : 'text-[#1B2A4A]'}`}>
                      {o.overlapPercent.toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-gray-400">{o.commonCount} common stocks</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {o.commonHoldings.map(h => (
                    <span key={h} className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">{h}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Underperformers */}
      {underperformers.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-red-700 mb-4 uppercase tracking-wide flex items-center gap-2">
            <TrendingDown size={14} /> Underperforming Funds
          </h3>
          <p className="text-xs text-red-500 mb-4">These funds have significantly underperformed. Consider reviewing or replacing them.</p>
          <div className="space-y-3">
            {underperformers.map(u => (
              <div key={u.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1B2A4A]">{u.scheme_name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{u.category}</p>
                </div>
                <div className="text-right">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-gray-400">1Y</p>
                      <p className={`text-sm font-bold ${u.return1Y != null && u.return1Y >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {u.return1Y != null ? formatPercent(u.return1Y) : '\u2014'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400">3Y</p>
                      <p className={`text-sm font-bold ${u.return3Y != null && u.return3Y >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {u.return3Y != null ? formatPercent(u.return3Y) : '\u2014'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Mutual fund investments are subject to market risks. Read all scheme related documents carefully.
          Past performance is not indicative of future returns. This is not investment advice — consult a
          SEBI-registered investment advisor for personalized recommendations. Overlap analysis is based on
          periodically updated static data and may not reflect current fund holdings.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color = 'text-[#1B2A4A]', prefix = '' }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-center">
      <p className="text-xs text-gray-400 font-medium uppercase">{label}</p>
      <p className={`text-xl font-bold mt-2 ${color}`}>{prefix}{value}</p>
    </div>
  )
}
