import { useState, useEffect } from 'react'
import {
  PieChart as PieChartIcon, Plus, Trash2, Loader2, AlertTriangle,
  TrendingDown, Building2, Layers, BarChart3, ChevronRight, Wallet, Landmark,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useToast } from '../components/Toast'
import { Modal } from '../components/UI'
import FundSearch from '../components/FundSearch'
import * as api from '../services/api'
import { formatCurrency, formatPercent } from '../lib/utils'

const PIE_COLORS = ['#38bdf8', '#fbbf24', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export default function PortfolioXray() {
  const { showToast } = useToast()
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [activeTab, setActiveTab] = useState('holdings')
  const [wealthSummary, setWealthSummary] = useState(null)
  const [wealthLoading, setWealthLoading] = useState(false)

  useEffect(() => {
    api.getClients().then(setClients).catch(err => showToast(err.message, 'error'))
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setHoldings([])
      setAnalysis(null)
      setWealthSummary(null)
      return
    }
    setLoading(true)
    api.getPortfolio(selectedClientId)
      .then(data => setHoldings(data.holdings))
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [selectedClientId])

  useEffect(() => {
    if (!selectedClientId || activeTab !== 'wealth') return
    setWealthLoading(true)
    api.getWealthSummary(selectedClientId)
      .then(setWealthSummary)
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setWealthLoading(false))
  }, [selectedClientId, activeTab])

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
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <PieChartIcon className="text-amber-400" /> Portfolio X-Ray
          </h1>
          <p className="text-slate-500 mt-1">Analyze client portfolios for overlap, concentration, and underperformers</p>
        </div>
      </div>

      {/* Client Selector */}
      <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-slate-400 font-medium block mb-1.5">Select Client</label>
            <select
              value={selectedClientId || ''}
              onChange={(e) => setSelectedClientId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2.5 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
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
                className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.10] text-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} /> Add Holding
              </button>
              {holdings.length > 0 && (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-ink-900 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
                >
                  {analyzing ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                  {analyzing ? 'Analyzing...' : 'Analyze Portfolio'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      {selectedClientId && (
        <div className="flex gap-1 mb-6 bg-surface-800 border border-white/[0.07] rounded-xl p-1 w-fit">
          {[
            { key: 'holdings', label: 'Holdings', icon: PieChartIcon },
            { key: 'wealth', label: 'Wealth View', icon: Wallet },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Add Holding Modal */}
      <AddHoldingModal
        open={showAddHolding}
        onAdd={handleAddHolding}
        onClose={() => setShowAddHolding(false)}
      />

      {/* Wealth View Tab */}
      {activeTab === 'wealth' && selectedClientId && (
        <WealthTabView wealthSummary={wealthSummary} loading={wealthLoading} />
      )}

      {/* Holdings List (pre-analysis) */}
      {activeTab === 'holdings' && loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading holdings...
        </div>
      ) : activeTab === 'holdings' && selectedClientId && holdings.length === 0 && !analysis ? (
        <div className="text-center py-16 bg-surface-800 border border-white/[0.07] rounded-xl shadow-sm">
          <PieChartIcon size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No holdings added yet. Click "Add Holding" to start building the portfolio.</p>
        </div>
      ) : activeTab === 'holdings' && holdings.length > 0 && !analysis ? (
        <div className="bg-surface-800 border border-white/[0.07] rounded-xl shadow-sm overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                <th className="text-left p-4 text-slate-400 font-medium">Fund</th>
                <th className="text-right p-4 text-slate-400 font-medium">Invested</th>
                <th className="text-right p-4 text-slate-400 font-medium">Units</th>
                <th className="text-right p-4 text-slate-400 font-medium">Purchase Date</th>
                <th className="text-right p-4 text-slate-400 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                  <td className="p-4">
                    <p className="font-medium text-slate-100 truncate max-w-xs">{h.scheme_name || h.scheme_code}</p>
                  </td>
                  <td className="p-4 text-right font-medium text-slate-100">{formatCurrency(h.invested_amount)}</td>
                  <td className="p-4 text-right text-slate-500">{h.units ? h.units.toFixed(3) : '\u2014'}</td>
                  <td className="p-4 text-right text-slate-500">{h.purchase_date || '\u2014'}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleDeleteHolding(h.id)} className="text-slate-600 hover:text-red-400 transition-colors">
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
      {activeTab === 'holdings' && analysis && <AnalysisView analysis={analysis} onDeleteHolding={handleDeleteHolding} />}
    </div>
  )
}

// ---------- Add Holding Modal ----------
function AddHoldingModal({ open, onAdd, onClose }) {
  const [fund, setFund] = useState(null)
  const [amount, setAmount] = useState('')
  const [units, setUnits] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset form whenever the modal is re-opened
  useEffect(() => {
    if (!open) return
    setFund(null); setAmount(''); setUnits(''); setPurchaseDate(''); setSaving(false)
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fund || !amount) return
    setSaving(true)
    await onAdd(fund, amount, units, purchaseDate)
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Holding" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">Fund *</label>
            <FundSearch onSelect={setFund} placeholder="Search mutual fund..." />
            {fund && <p className="text-xs text-amber-400 mt-1 truncate">{fund.scheme_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Invested Amount ({'\u20B9'}) *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100000" required className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Units (optional)</label>
              <input type="number" step="0.001" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="e.g. 523.456" className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">Purchase Date (optional)</label>
            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300">Cancel</button>
            <button type="submit" disabled={!fund || !amount || saving} className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-ink-900 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Holding
            </button>
          </div>
      </form>
    </Modal>
  )
}

// ---------- Wealth Tab View ----------
function WealthTabView({ wealthSummary, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading wealth data...
      </div>
    )
  }
  if (!wealthSummary) return null

  const { summary, buckets, household_by_type } = wealthSummary

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Invested" value={formatCurrency(summary.total_invested)} />
        <SummaryCard label="Estimated Value" value={formatCurrency(summary.total_estimated_value)} color="text-emerald-400" />
        <SummaryCard label="Mutual Funds" value={formatCurrency(summary.mf_invested)} />
        <SummaryCard label="Other Assets" value={formatCurrency(summary.household_estimated_value)} />
      </div>

      {/* Allocation Buckets */}
      {buckets && buckets.length > 0 && (
        <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-100 mb-4 uppercase tracking-wide flex items-center gap-2">
            <Wallet size={14} /> Wealth Allocation
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={buckets}
                  dataKey="estimated_value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ label, pct_of_total }) => `${label} ${pct_of_total}%`}
                  labelLine={true}
                >
                  {buckets.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {buckets.map((b, i) => (
                <div key={b.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 font-medium">{b.label}</span>
                    <span className="text-slate-100 font-semibold">{formatCurrency(b.estimated_value)} ({b.pct_of_total}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(b.pct_of_total, 100)}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Non-MF Asset Groups */}
      {household_by_type && household_by_type.length > 0 && (
        <div className="bg-surface-800 border border-white/[0.07] rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Landmark size={14} /> Non-MF Assets
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                <th className="text-left p-4 text-slate-400 font-medium">Asset Type</th>
                <th className="text-right p-4 text-slate-400 font-medium">Count</th>
                <th className="text-right p-4 text-slate-400 font-medium">Invested</th>
                <th className="text-right p-4 text-slate-400 font-medium">Estimated Value</th>
              </tr>
            </thead>
            <tbody>
              {household_by_type.map(group => (
                <tr key={group.asset_type} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                  <td className="p-4 font-medium text-slate-100">{group.label}</td>
                  <td className="p-4 text-right text-slate-500">{group.count}</td>
                  <td className="p-4 text-right text-slate-100">{formatCurrency(group.invested)}</td>
                  <td className="p-4 text-right font-medium text-emerald-400">{formatCurrency(group.estimated_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(!household_by_type || household_by_type.length === 0) && summary.household_assets_count === 0 && (
        <div className="text-center py-12 bg-surface-800 border border-white/[0.07] rounded-xl">
          <Landmark size={36} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No non-MF assets recorded.</p>
          <p className="text-slate-600 text-xs mt-1">Add assets via the Wealth Overview page.</p>
        </div>
      )}
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
        <SummaryCard label="Current Value" value={formatCurrency(summary.currentValue)} color={summary.gain >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <SummaryCard label="Total Gain" value={formatCurrency(Math.abs(summary.gain))} prefix={summary.gain >= 0 ? '+' : '-'} color={summary.gain >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <SummaryCard label="Return" value={formatPercent(summary.gainPercent)} color={summary.gainPercent >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      </div>

      {/* Holdings Table with Returns */}
      <div className="bg-surface-800 border border-white/[0.07] rounded-xl shadow-sm overflow-x-auto">
        <div className="p-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">Holdings Detail</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.02] border-b border-white/[0.06]">
              <th className="text-left p-3 text-slate-400 font-medium">Fund</th>
              <th className="text-right p-3 text-slate-400 font-medium">Invested</th>
              <th className="text-right p-3 text-slate-400 font-medium">Current</th>
              <th className="text-right p-3 text-slate-400 font-medium">Gain</th>
              <th className="text-right p-3 text-slate-400 font-medium">1Y</th>
              <th className="text-right p-3 text-slate-400 font-medium">3Y</th>
              <th className="text-right p-3 text-slate-400 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                <td className="p-3">
                  <p className="font-medium text-slate-100 truncate max-w-[200px]">{h.scheme_name || h.scheme_code}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{h.category}{h.amc ? ` \u00B7 ${h.amc}` : ''}</p>
                </td>
                <td className="p-3 text-right">{formatCurrency(h.invested_amount)}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(h.currentValue)}</td>
                <td className={`p-3 text-right font-medium ${h.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatPercent(h.gainPercent)}
                </td>
                <td className={`p-3 text-right ${h.returns?.['1Y'] != null ? (h.returns['1Y'] >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-600'}`}>
                  {h.returns?.['1Y'] != null ? formatPercent(h.returns['1Y']) : '\u2014'}
                </td>
                <td className={`p-3 text-right ${h.returns?.['3Y'] != null ? (h.returns['3Y'] >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-600'}`}>
                  {h.returns?.['3Y'] != null ? formatPercent(h.returns['3Y']) : '\u2014'}
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => onDeleteHolding(h.id)} className="text-slate-600 hover:text-red-400 transition-colors">
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
          <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4 uppercase tracking-wide flex items-center gap-2">
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
          <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4 uppercase tracking-wide flex items-center gap-2">
              <Building2 size={14} /> AMC Concentration
            </h3>
            <div className="space-y-3">
              {amcConcentration.map((item, i) => (
                <div key={item.amc}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium truncate mr-2">{item.amc}</span>
                    <span className={`font-semibold ${item.percent > 50 ? 'text-red-400' : item.percent > 30 ? 'text-amber-400' : 'text-slate-100'}`}>
                      {item.percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(item.percent, 100)}%`,
                        backgroundColor: item.percent > 50 ? '#ef4444' : item.percent > 30 ? '#f59e0b' : PIE_COLORS[i % PIE_COLORS.length]
                      }}
                    />
                  </div>
                  {item.percent > 50 && (
                    <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1">
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
        <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-100 mb-4 uppercase tracking-wide flex items-center gap-2">
            <Layers size={14} /> Holdings Overlap
          </h3>
          <p className="text-xs text-slate-400 mb-4">Funds with common top holdings — you may be paying double expense ratio for similar exposure.</p>
          <div className="space-y-4">
            {overlap.map((o, i) => (
              <div key={i} className="border border-white/[0.07] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-100 truncate">{o.fund1.name}</p>
                    <p className="text-[10px] text-slate-400">vs</p>
                    <p className="text-xs font-medium text-slate-100 truncate">{o.fund2.name}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className={`text-lg font-bold ${o.overlapPercent > 60 ? 'text-red-400' : o.overlapPercent > 40 ? 'text-amber-400' : 'text-slate-100'}`}>
                      {o.overlapPercent.toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-slate-400">{o.commonCount} common stocks</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {o.commonHoldings.map(h => (
                    <span key={h} className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full">{h}</span>
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
                  <p className="text-sm font-medium text-slate-100">{u.scheme_name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{u.category}</p>
                </div>
                <div className="text-right">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400">1Y</p>
                      <p className={`text-sm font-bold ${u.return1Y != null && u.return1Y >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {u.return1Y != null ? formatPercent(u.return1Y) : '\u2014'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">3Y</p>
                      <p className={`text-sm font-bold ${u.return3Y != null && u.return3Y >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
      <div className="bg-gray-50 border border-white/[0.07] rounded-xl p-4">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Mutual fund investments are subject to market risks. Read all scheme related documents carefully.
          Past performance is not indicative of future returns. This is not investment advice — consult a
          SEBI-registered investment advisor for personalized recommendations. Overlap analysis is based on
          periodically updated static data and may not reflect current fund holdings.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color = 'text-slate-100', prefix = '' }) {
  return (
    <div className="bg-white border border-white/[0.07] rounded-xl p-5 shadow-sm text-center">
      <p className="text-xs text-slate-400 font-medium uppercase">{label}</p>
      <p className={`text-xl font-bold mt-2 ${color}`}>{prefix}{value}</p>
    </div>
  )
}
