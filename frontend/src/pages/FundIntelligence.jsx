import { useState, useEffect } from 'react'
import { TrendingUp, Search, BarChart3, Calculator, Grid3X3, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar, Cell } from 'recharts'
import FundSearch from '../components/FundSearch'
import * as api from '../services/api'
import { formatCurrency, formatPercent, formatDate } from '../lib/utils'

const TABS = [
  { id: 'search', label: 'Fund Search', icon: Search },
  { id: 'compare', label: 'Compare Funds', icon: BarChart3 },
  { id: 'sip', label: 'SIP Backtest', icon: Calculator },
  { id: 'heatmap', label: 'Category Heatmap', icon: Grid3X3 },
]

const CHART_COLORS = ['#D4A847', '#1B2A4A', '#10b981', '#f59e0b', '#ef4444']

export default function FundIntelligence() {
  const [activeTab, setActiveTab] = useState('search')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  const handleSync = async () => {
    setSyncing(true)
    setSyncStatus(null)
    try {
      const result = await api.syncAmfiData()
      setSyncStatus({ type: 'success', message: `Synced ${result.synced} funds` })
    } catch (err) {
      setSyncStatus({ type: 'error', message: err.message })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A] flex items-center gap-2">
            <TrendingUp className="text-[#D4A847]" /> Fund Intelligence Engine
          </h1>
          <p className="text-gray-500 mt-1">Research, compare, and backtest mutual funds</p>
        </div>
        <div className="flex items-center gap-3">
          {syncStatus && (
            <span className={`text-xs px-3 py-1 rounded-full ${syncStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {syncStatus.message}
            </span>
          )}
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]/90 disabled:opacity-50 transition-colors">
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {syncing ? 'Syncing...' : 'Sync AMFI Data'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 mb-6 shadow-sm">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === id ? 'bg-[#1B2A4A] text-white shadow-sm' : 'text-gray-500 hover:text-[#1B2A4A] hover:bg-gray-50'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'search' && <FundSearchTab />}
      {activeTab === 'compare' && <FundCompareTab />}
      {activeTab === 'sip' && <SipBacktestTab />}
      {activeTab === 'heatmap' && <CategoryHeatmapTab />}
    </div>
  )
}

// ---------- Fund Search Tab ----------
function FundSearchTab() {
  const [selectedFund, setSelectedFund] = useState(null)
  const [returns, setReturns] = useState(null)
  const [risk, setRisk] = useState(null)
  const [rolling, setRolling] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSelect = async (fund) => {
    setSelectedFund(fund)
    setLoading(true)
    setReturns(null)
    setRisk(null)
    setRolling(null)
    try {
      const [ret, rsk, roll] = await Promise.all([
        api.calculateReturns(fund.scheme_code),
        api.getRiskMetrics(fund.scheme_code),
        api.getRollingReturns(fund.scheme_code, 1, 5),
      ])
      setReturns(ret)
      setRisk(rsk)
      setRolling(roll)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <FundSearch onSelect={handleSelect} placeholder="Search by fund name, AMC, or category..." className="max-w-xl" />

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-3" /> Loading fund data...
        </div>
      )}

      {selectedFund && returns && (
        <div className="mt-6 space-y-6">
          {/* Fund Header */}
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1B2A4A]">{selectedFund.scheme_name}</h2>
            <p className="text-sm text-gray-500 mt-1">{selectedFund.scheme_category} · {selectedFund.amc}</p>
            <div className="flex items-center gap-6 mt-4">
              <div>
                <p className="text-xs text-gray-400 uppercase">Latest NAV</p>
                <p className="text-xl font-bold text-[#1B2A4A]">{'\u20B9'}{selectedFund.nav}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">NAV Date</p>
                <p className="text-sm font-medium">{selectedFund.nav_date}</p>
              </div>
            </div>
          </div>

          {/* Returns Table */}
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide">Returns (CAGR)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
              {['1M', '3M', '6M', '1Y', '3Y', '5Y', '10Y', 'SI'].map((period) => {
                const data = returns[period]
                return (
                  <div key={period} className="text-center p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400 font-medium">{period}</p>
                    {data ? (
                      <p className={`text-lg font-bold mt-1 ${data.return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatPercent(data.return)}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-300 mt-1">N/A</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Risk Metrics */}
          {risk && (
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide">Risk Metrics (3Y)</h3>
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-4 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 font-medium">Std Deviation</p>
                  <p className="text-xl font-bold text-[#1B2A4A] mt-1">{risk.standardDeviation != null ? risk.standardDeviation.toFixed(2) + '%' : 'N/A'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 font-medium">Max Drawdown</p>
                  <p className="text-xl font-bold text-red-500 mt-1">{risk.maxDrawdown != null ? '-' + risk.maxDrawdown.toFixed(2) + '%' : 'N/A'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 font-medium">Sharpe Ratio</p>
                  <p className="text-xl font-bold text-[#1B2A4A] mt-1">{risk.sharpeRatio != null ? risk.sharpeRatio.toFixed(2) : 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Rolling Returns Chart */}
          {rolling && rolling.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide">1Y Rolling Returns (over 5Y)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={rolling}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.substring(0, 7)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toFixed(0) + '%'} />
                  <Tooltip formatter={(v) => [v.toFixed(2) + '%', 'Return']} labelFormatter={(d) => formatDate(d)} />
                  <Line type="monotone" dataKey="return" stroke="#D4A847" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Fund Compare Tab ----------
function FundCompareTab() {
  const [selected, setSelected] = useState([])
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(false)

  const addFund = (fund) => {
    if (selected.length >= 4) return
    if (selected.find(f => f.scheme_code === fund.scheme_code)) return
    setSelected([...selected, fund])
  }

  const removeFund = (code) => {
    setSelected(selected.filter(f => f.scheme_code !== code))
    setComparison(null)
  }

  const handleCompare = async () => {
    if (selected.length < 2) return
    setLoading(true)
    try {
      const data = await api.compareFunds(selected.map(f => f.scheme_code))
      setComparison(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <FundSearch onSelect={addFund} placeholder="Add fund to compare (max 4)..." className="max-w-xl" />

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {selected.map((fund, i) => (
            <span key={fund.scheme_code} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium" style={{ backgroundColor: CHART_COLORS[i] + '15', color: CHART_COLORS[i] }}>
              {fund.scheme_name.length > 40 ? fund.scheme_name.substring(0, 40) + '...' : fund.scheme_name}
              <button onClick={() => removeFund(fund.scheme_code)} className="hover:opacity-70">{'\u00D7'}</button>
            </span>
          ))}
          {selected.length >= 2 && (
            <button onClick={handleCompare} disabled={loading} className="px-4 py-1.5 bg-[#D4A847] text-white rounded-full text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors">
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          )}
        </div>
      )}

      {comparison && (
        <div className="mt-6 bg-white border border-gray-100 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left p-4 text-gray-400 font-medium">Metric</th>
                {comparison.map((fund, i) => (
                  <th key={fund.code} className="text-right p-4 font-medium" style={{ color: CHART_COLORS[i] }}>
                    {fund.name?.length > 30 ? fund.name.substring(0, 30) + '...' : fund.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['1Y', '3Y', '5Y', '10Y', 'SI'].map((period) => (
                <tr key={period} className="border-b border-gray-50">
                  <td className="p-4 text-gray-500 font-medium">{period} Return</td>
                  {comparison.map((fund) => {
                    const val = fund.returns?.[period]?.return
                    return (
                      <td key={fund.code} className={`p-4 text-right font-semibold ${val != null ? (val >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-300'}`}>
                        {val != null ? formatPercent(val) : 'N/A'}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-b border-gray-50">
                <td className="p-4 text-gray-500 font-medium">Std Dev (3Y)</td>
                {comparison.map((fund) => (
                  <td key={fund.code} className="p-4 text-right font-semibold text-[#1B2A4A]">
                    {fund.risk?.standardDeviation != null ? fund.risk.standardDeviation.toFixed(2) + '%' : 'N/A'}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-50">
                <td className="p-4 text-gray-500 font-medium">Max Drawdown (3Y)</td>
                {comparison.map((fund) => (
                  <td key={fund.code} className="p-4 text-right font-semibold text-red-500">
                    {fund.risk?.maxDrawdown != null ? '-' + fund.risk.maxDrawdown.toFixed(2) + '%' : 'N/A'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-gray-500 font-medium">Sharpe Ratio (3Y)</td>
                {comparison.map((fund) => (
                  <td key={fund.code} className="p-4 text-right font-semibold text-[#1B2A4A]">
                    {fund.risk?.sharpeRatio != null ? fund.risk.sharpeRatio.toFixed(2) : 'N/A'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- SIP Backtest Tab ----------
function SipBacktestTab() {
  const [fund, setFund] = useState(null)
  const [sipAmount, setSipAmount] = useState('5000')
  const [startDate, setStartDate] = useState('2019-01-01')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleBacktest = async () => {
    if (!fund) return
    setLoading(true)
    setResult(null)
    try {
      const data = await api.sipBacktest({
        code: fund.scheme_code,
        sip: sipAmount,
        start: startDate,
      })
      setResult(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide">SIP Backtest Parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Select Fund</label>
            <FundSearch onSelect={setFund} placeholder="Search fund..." />
            {fund && <p className="text-xs text-[#D4A847] mt-1 truncate">{fund.scheme_name}</p>}
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Monthly SIP ({'\u20B9'})</label>
            <input type="number" value={sipAmount} onChange={(e) => setSipAmount(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
        </div>
        <button onClick={handleBacktest} disabled={!fund || loading} className="mt-4 px-6 py-2.5 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors">
          {loading ? 'Running Backtest...' : 'Run Backtest'}
        </button>
      </div>

      {result && (
        <div className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-400 font-medium uppercase">Total Invested</p>
              <p className="text-xl font-bold text-[#1B2A4A] mt-2">{formatCurrency(result.totalInvested)}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-400 font-medium uppercase">Current Value</p>
              <p className="text-xl font-bold text-emerald-600 mt-2">{formatCurrency(result.currentValue)}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-400 font-medium uppercase">XIRR</p>
              <p className={`text-xl font-bold mt-2 ${result.xirr >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {result.xirr != null ? formatPercent(result.xirr) : 'N/A'}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-center">
              <p className="text-xs text-gray-400 font-medium uppercase">Absolute Return</p>
              <p className={`text-xl font-bold mt-2 ${result.absoluteReturn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatPercent(result.absoluteReturn)}
              </p>
            </div>
          </div>

          {/* Growth Chart */}
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4 uppercase tracking-wide">Growth Over Time</h3>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={result.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.substring(0, 7)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => '\u20B9' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : (v / 1000).toFixed(0) + 'K')} />
                <Tooltip formatter={(v, name) => [formatCurrency(v), name === 'invested' ? 'Invested' : 'Value']} labelFormatter={formatDate} />
                <Legend />
                <Line type="monotone" dataKey="invested" stroke="#1B2A4A" strokeWidth={2} dot={false} name="Invested" />
                <Line type="monotone" dataKey="value" stroke="#D4A847" strokeWidth={2} dot={false} name="Current Value" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Category Heatmap Tab ----------
function CategoryHeatmapTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadHeatmap()
  }, [])

  const loadHeatmap = async () => {
    setLoading(true)
    try {
      const result = await api.getCategoryHeatmap()
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 size={24} className="animate-spin mr-3" /> Loading categories...</div>
  if (!data) return <div className="text-center py-20 text-gray-400">Click "Sync AMFI Data" first to populate categories</div>

  // Group by type
  const grouped = {}
  for (const item of data) {
    const type = item.type || 'Other'
    if (!grouped[type]) grouped[type] = []
    grouped[type].push(item)
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1B2A4A] mb-4">{type}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.sort((a, b) => b.fundCount - a.fundCount).map((cat) => (
              <div key={cat.category} className="p-3 rounded-lg border border-gray-100 hover:border-[#D4A847]/30 transition-colors">
                <p className="text-xs font-medium text-[#1B2A4A] truncate" title={cat.category}>{cat.category}</p>
                <p className="text-xs text-gray-400 mt-1">{cat.fundCount} funds</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
