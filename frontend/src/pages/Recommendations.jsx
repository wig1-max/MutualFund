import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Brain, Edit3, Play, RefreshCw, Loader2, Check, AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useToast } from '../components/Toast'
import { formatCurrency } from '../lib/utils'
import * as api from '../services/api'

function formatProbability(pct) {
  if (pct === null || pct === undefined) return '—'
  if (pct >= 80) return { value: pct + '%', color: 'text-emerald-400', label: 'High confidence' }
  if (pct >= 60) return { value: pct + '%', color: 'text-amber-600', label: 'Moderate confidence' }
  return { value: pct + '%', color: 'text-red-500', label: 'Low confidence — review SIP amount' }
}

const RISK_COLORS = {
  Conservative: '#22c55e',
  'Moderate Conservative': '#86efac',
  Moderate: '#3b82f6',
  'Moderately Aggressive': '#f59e0b',
  Aggressive: '#ef4444',
}

const BUCKET_COLORS = {
  equity: '#3b82f6',
  debt: '#22c55e',
  hybrid: '#a855f7',
  gold: '#f59e0b',
  international: '#06b6d4',
  liquid: '#6b7280',
  solution: '#ec4899',
  other: '#9ca3af',
}

const ALLOC_COLORS = ['#3b82f6', '#22c55e', '#f59e0b']

const SCORE_COMPONENTS = [
  { label: 'Category Fit', max: 25, desc: 'How well the fund category matches your risk profile and goals' },
  { label: 'Risk Alignment', max: 25, desc: 'How closely the fund\'s volatility matches your risk capacity' },
  { label: 'Tax Efficiency', max: 20, desc: 'Tax treatment advantage based on your slab and holding period' },
  { label: 'Overlap Check', max: 20, desc: 'Penalty for portfolio overlap with your existing holdings' },
  { label: 'Fund Quality', max: 10, desc: 'Returns consistency, Sharpe ratio, and drawdown metrics' },
]

export default function Recommendations() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [client, setClient] = useState(null)
  const [profile, setProfile] = useState(null)
  const [recommendations, setRecs] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [data, setData] = useState(null)
  const [sipBudget, setSipBudget] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [clientData, recData] = await Promise.all([
        api.getClient(clientId),
        api.getRecommendations(clientId),
      ])
      setClient(clientData)
      setProfile(recData.profile)
      setRecs(recData.recommendations || [])
      setGeneratedAt(recData.generated_at)
      setData(recData)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [clientId])

  const runEngine = async () => {
    setRunning(true)
    try {
      await api.runScoring(Number(clientId))
      showToast('Scoring complete!', 'success')
      await loadData()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRunning(false)
    }
  }

  const totalSIP = recommendations.reduce((s, r) => s + (r.recommended_sip || 0), 0)
  const surplus = profile?.investable_surplus || 0
  const effectiveBudget = sipBudget ?? surplus
  const sipScale = surplus > 0 ? effectiveBudget / surplus : 1
  const adjustedRecs = recommendations.map(rec => ({
    ...rec,
    adjusted_sip: Math.max(500, Math.round((rec.recommended_sip * sipScale) / 500) * 500)
  }))
  const adjustedTotal = adjustedRecs.reduce((s, r) => s + r.adjusted_sip, 0)
  const sipPct = surplus > 0 ? (adjustedTotal / surplus) * 100 : 0

  const CRITERIA = [
    { key: 'category_fit_score', label: 'Fit', max: 25, color: '#3b82f6' },
    { key: 'risk_alignment_score', label: 'Risk', max: 25, color: '#8b5cf6' },
    { key: 'tax_efficiency_score', label: 'Tax', max: 20, color: '#10b981' },
    { key: 'overlap_penalty', label: 'Overlap', max: 20, color: '#f59e0b', invert: true },
    { key: 'quality_score', label: 'Quality', max: 10, color: '#06b6d4' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-amber-400" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ink-800 flex items-center justify-center">
            <Brain className="text-amber-400" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Fund Recommendations</h1>
            <p className="text-slate-500 text-sm">{client?.name || 'Client'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/profile/${clientId}`)}
            className="flex items-center gap-1.5 px-4 py-2 border border-white/[0.08] rounded-lg text-sm font-medium text-slate-400 hover:border-amber-500/50 hover:text-slate-200">
            <Edit3 size={14} /> Edit Profile
          </button>
          <button onClick={runEngine} disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-ink-900 rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50">
            {running ? <Loader2 size={14} className="animate-spin" /> : recommendations.length > 0 ? <RefreshCw size={14} /> : <Play size={14} />}
            {recommendations.length > 0 ? 'Re-run Engine' : 'Run Engine'}
          </button>
        </div>
      </div>

      {/* Running State */}
      {running && (
        <div className="bg-gradient-to-r from-ink-800 to-ink-600 rounded-xl p-8 text-center text-white mb-6">
          <Loader2 className="animate-spin text-amber-400 mx-auto mb-3" size={36} />
          <p className="text-lg font-semibold">Scoring Engine Running</p>
          <p className="text-sm text-slate-400 mt-1">Matching profile against 10,000+ funds</p>
        </div>
      )}

      {!running && !profile && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center mb-6">
          <AlertTriangle className="text-amber-400 mx-auto mb-2" size={28} />
          <p className="text-amber-300 font-medium">No profile found for this client</p>
          <button onClick={() => navigate(`/profile/${clientId}`)}
            className="mt-3 px-4 py-2 bg-amber-500 text-ink-900 rounded-lg text-sm font-medium hover:bg-amber-400">
            Create Profile
          </button>
        </div>
      )}

      {!running && profile && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Risk Label */}
            <div className="bg-surface-800 rounded-xl border border-white/[0.07] shadow-sm p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Risk Profile</p>
              <p className="text-lg font-bold text-slate-100 mb-2">{profile.risk_label}</p>
              <div className="w-full bg-white/[0.08] rounded-full h-2.5">
                <div className="h-2.5 rounded-full transition-all"
                  style={{
                    width: `${profile.risk_capacity_score}%`,
                    backgroundColor: RISK_COLORS[profile.risk_label] || '#3b82f6',
                  }} />
              </div>
              <p className="text-xs text-slate-500 mt-1">Score: {profile.risk_capacity_score}/100</p>
            </div>

            {/* SIP vs Surplus */}
            <div className="bg-surface-800 rounded-xl border border-white/[0.07] shadow-sm p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Monthly SIP Plan</p>
              <p className="text-lg font-bold text-slate-100">
                {formatCurrency(adjustedTotal)}
                <span className="text-sm text-slate-500 font-normal"> / {formatCurrency(surplus)} surplus</span>
              </p>
              <div className="w-full bg-white/[0.08] rounded-full h-2.5 mt-2">
                <div className={`h-2.5 rounded-full transition-all ${sipPct > 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(100, sipPct)}%` }} />
              </div>
              {recommendations.length > 0 && (
                <div className="mt-3">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide">Adjust Monthly Budget</label>
                  <input type="range"
                    min={Math.max(500, Math.min(2000, Math.floor(surplus * 0.1)))}
                    max={Math.max(surplus * 2, 50000)}
                    step={500}
                    value={effectiveBudget}
                    onChange={e => setSipBudget(Number(e.target.value))}
                    className="w-full h-1.5 mt-1.5 accent-amber-500 cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>{'\u20B9'}{Math.max(500, Math.min(2000, Math.floor(surplus * 0.1))).toLocaleString('en-IN')}</span>
                    <span className="text-amber-400 font-semibold">{'\u20B9'}{effectiveBudget.toLocaleString('en-IN')}/mo</span>
                    <span>{'\u20B9'}{Math.max(surplus * 2, 50000).toLocaleString('en-IN')}</span>
                  </div>
                  {sipBudget !== null && sipBudget !== surplus && (
                    <button onClick={() => setSipBudget(null)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 mt-1">
                      Reset to recommended
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Allocation Pie */}
            <div className="bg-surface-800 rounded-xl border border-white/[0.07] shadow-sm p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Recommended Allocation</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[
                        { name: 'Equity', value: profile.recommended_equity_pct || 0 },
                        { name: 'Debt', value: profile.recommended_debt_pct || 0 },
                        { name: 'Gold', value: profile.recommended_gold_pct || 0 },
                      ]} dataKey="value" innerRadius={20} outerRadius={35} paddingAngle={2}>
                        {ALLOC_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                      </Pie>
                      <Tooltip formatter={(v) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs space-y-1">
                  <p><span className="inline-block w-2 h-2 rounded-full bg-[#3b82f6] mr-1" />Equity {profile.recommended_equity_pct}%</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] mr-1" />Debt {profile.recommended_debt_pct}%</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b] mr-1" />Gold {profile.recommended_gold_pct}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Goal Survival Probability */}
          {data?.survival_analysis && (
            <div className="bg-ink-800 rounded-xl border border-white/[0.07] p-6 text-white mb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-400 flex items-center gap-2">
                    ⚡ Goal Survival Probability
                  </h2>
                  <p className="text-gray-400 text-xs mt-1">
                    Based on {data.survival_analysis.simulationsRun.toLocaleString('en-IN')} Monte Carlo simulations
                  </p>
                </div>
                {/* Big probability number */}
                <div className="text-right">
                  <p className="text-5xl font-bold" style={{
                    color: data.survival_analysis.baseProbability >= 80
                      ? '#10b981'
                      : data.survival_analysis.baseProbability >= 60
                        ? '#f59e0b'
                        : '#ef4444'
                  }}>
                    {data.survival_analysis.baseProbability}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    probability of reaching goal
                  </p>
                </div>
              </div>

              {/* Three outcome cards */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: 'Worst Case (5th pct)', value: data.survival_analysis.outcomes.worst, color: '#ef4444' },
                  { label: 'Median Outcome', value: data.survival_analysis.outcomes.median, color: '#fbbf24' },
                  { label: 'Best Case (95th pct)', value: data.survival_analysis.outcomes.best, color: '#10b981' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/5 rounded-lg p-4 text-center">
                    <p className="text-[10px] text-gray-400 uppercase mb-2">{label}</p>
                    <p className="text-lg font-bold" style={{ color }}>
                      {value >= 10000000
                        ? '₹' + (value / 10000000).toFixed(1) + ' Cr'
                        : value >= 100000
                          ? '₹' + (value / 100000).toFixed(1) + ' L'
                          : '₹' + value.toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>

              {/* India Stress Tests */}
              {data.survival_analysis.stressTests && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">
                    Stress Test Survival Rates
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'covid2020', label: 'COVID-2020 Crash', emoji: '🦠' },
                      { key: 'globalFinancialCrisis', label: 'GFC 2008 Scenario', emoji: '📉' },
                      { key: 'prolongedStagnation', label: 'Lost Decade Scenario', emoji: '⏳' },
                    ].map(({ key, label, emoji }) => {
                      const pct = data.survival_analysis.stressTests[key]
                      return (
                        <div key={key} className="bg-white/5 rounded-lg px-3 py-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-gray-400">{emoji} {label}</p>
                          </div>
                          <p className={`text-sm font-bold ml-2 shrink-0 ${
                            pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {pct}%
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommendations Table */}
          {adjustedRecs.length > 0 && (
            <div className="bg-surface-800 rounded-xl border border-white/[0.07] shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Top Fund Picks</h2>
                {generatedAt && <span className="text-xs text-slate-500">Generated {new Date(generatedAt).toLocaleDateString('en-IN')}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 w-10">#</th>
                      <th className="px-4 py-3">Fund</th>
                      <th className="px-4 py-3">Bucket</th>
                      <th className="px-4 py-3 w-40">Match Score</th>
                      <th className="px-4 py-3 text-right">SIP/mo</th>
                      <th className="px-4 py-3">Reasons</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {adjustedRecs.map(rec => (
                      <tr key={rec.id} className="hover:bg-white/[0.04]">
                        <td className="px-4 py-3 font-bold text-slate-100">{rec.rank}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-100">{rec.scheme_name}</p>
                          <p className="text-xs text-slate-500">{rec.category} &middot; {rec.amc}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: BUCKET_COLORS[rec.allocation_bucket] || '#9ca3af' }}>
                            {rec.allocation_bucket}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <span className="text-sm font-bold" style={{
                              color: rec.composite_score >= 75 ? '#10b981' :
                                     rec.composite_score >= 50 ? '#fbbf24' : '#94a3b8'
                            }}>{rec.composite_score}%</span>
                            <div className="flex gap-0.5">
                              {CRITERIA.map(c => {
                                const val = c.invert ? (c.max - (rec[c.key] || 0)) : (rec[c.key] || 0)
                                const pct = Math.round((val / c.max) * 100)
                                const barColor = pct >= 70 ? c.color : pct >= 40 ? '#fbbf24' : '#64748b'
                                return (
                                  <div key={c.key} className="flex-1" title={`${c.label}: ${val}/${c.max}`}>
                                    <div className="h-1.5 rounded-full bg-white/[0.06]">
                                      <div className="h-full rounded-full transition-all" style={{
                                        width: `${pct}%`, backgroundColor: barColor
                                      }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex gap-0.5 text-[8px] text-slate-600">
                              {CRITERIA.map(c => <span key={c.key} className="flex-1 text-center">{c.label}</span>)}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-100">{formatCurrency(rec.adjusted_sip || 0)}</td>
                        <td className="px-4 py-3">
                          <ul className="space-y-0.5">
                            {(Array.isArray(rec.reasons) ? rec.reasons : []).slice(0, 3).map((r, i) => (
                              <li key={i} className="flex items-start gap-1 text-xs text-slate-500">
                                <Check size={12} className="text-emerald-400 mt-0.5 shrink-0" /> {r}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#1B2A4A] text-white">
                      <td colSpan={4} className="px-4 py-3 font-semibold">Total Monthly SIP</td>
                      <td className="px-4 py-3 text-right font-bold text-[#D4A847]">{formatCurrency(adjustedTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Score Breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">How Scores Are Calculated</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {SCORE_COMPONENTS.map(c => (
                <div key={c.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-semibold text-[#1B2A4A]">{c.label}</p>
                  <p className="text-lg font-bold text-[#D4A847]">/{c.max}</p>
                  <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-4">Monte Carlo analysis runs 1,000+ simulations using t-distribution sampling to account for fat-tailed return distributions observed in Indian equity markets. Stress scenarios are calibrated to COVID-2020, GFC 2008, and prolonged stagnation events. Survival probability is not a guarantee.</p>
          </div>

          {/* CTA Strip */}
          <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2a3f6a] rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-lg">Ready to share with your client?</p>
              <p className="text-gray-300 text-sm">Generate a branded PDF report with all recommendations</p>
            </div>
            <button onClick={() => navigate('/report-generator')}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#D4A847] text-[#1B2A4A] rounded-lg font-semibold hover:bg-[#c49a3a]">
              Generate Report <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function RecommendationsLanding() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getClients()
      .then(setClients)
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
          <Brain className="text-[#D4A847]" size={20} />
        </div>
        <h1 className="text-2xl font-bold text-[#1B2A4A]">Fund Recommendations</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
        {loading ? (
          <Loader2 className="animate-spin text-[#D4A847]" size={20} />
        ) : (
          <div className="relative">
            <select onChange={e => { if (e.target.value) navigate(`/scoring/${e.target.value}`) }}
              defaultValue=""
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1B2A4A] appearance-none focus:outline-none focus:ring-2 focus:ring-[#D4A847]/50">
              <option value="" disabled>Choose a client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
          </div>
        )}
      </div>
    </div>
  )
}
