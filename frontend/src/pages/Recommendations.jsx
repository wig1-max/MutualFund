import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Brain, Edit3, Play, RefreshCw, Loader2, Check, AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useToast } from '../components/Toast'
import { formatCurrency } from '../lib/utils'
import * as api from '../services/api'

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
  const sipPct = surplus > 0 ? (totalSIP / surplus) * 100 : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[#D4A847]" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
            <Brain className="text-[#D4A847]" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1B2A4A]">Fund Recommendations</h1>
            <p className="text-gray-500 text-sm">{client?.name || 'Client'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/profile/${clientId}`)}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:border-[#D4A847] hover:text-[#1B2A4A]">
            <Edit3 size={14} /> Edit Profile
          </button>
          <button onClick={runEngine} disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#2a3f6a] disabled:opacity-50">
            {running ? <Loader2 size={14} className="animate-spin" /> : recommendations.length > 0 ? <RefreshCw size={14} /> : <Play size={14} />}
            {recommendations.length > 0 ? 'Re-run Engine' : 'Run Engine'}
          </button>
        </div>
      </div>

      {/* Running State */}
      {running && (
        <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2a3f6a] rounded-xl p-8 text-center text-white mb-6">
          <Loader2 className="animate-spin text-[#D4A847] mx-auto mb-3" size={36} />
          <p className="text-lg font-semibold">Scoring Engine Running</p>
          <p className="text-sm text-gray-300 mt-1">Matching profile against 10,000+ funds</p>
        </div>
      )}

      {!running && !profile && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center mb-6">
          <AlertTriangle className="text-yellow-500 mx-auto mb-2" size={28} />
          <p className="text-yellow-800 font-medium">No profile found for this client</p>
          <button onClick={() => navigate(`/profile/${clientId}`)}
            className="mt-3 px-4 py-2 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a3a]">
            Create Profile
          </button>
        </div>
      )}

      {!running && profile && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Risk Label */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Risk Profile</p>
              <p className="text-lg font-bold text-[#1B2A4A] mb-2">{profile.risk_label}</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="h-2.5 rounded-full transition-all"
                  style={{
                    width: `${profile.risk_capacity_score}%`,
                    backgroundColor: RISK_COLORS[profile.risk_label] || '#3b82f6',
                  }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">Score: {profile.risk_capacity_score}/100</p>
            </div>

            {/* SIP vs Surplus */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Monthly SIP Plan</p>
              <p className="text-lg font-bold text-[#1B2A4A]">{formatCurrency(totalSIP)}<span className="text-sm text-gray-400 font-normal"> / {formatCurrency(surplus)}</span></p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div className={`h-2.5 rounded-full transition-all ${sipPct > 70 ? 'bg-red-500' : 'bg-[#D4A847]'}`}
                  style={{ width: `${Math.min(100, sipPct)}%` }} />
              </div>
              {sipPct > 70 && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> SIPs exceed 70% of surplus
                </p>
              )}
            </div>

            {/* Allocation Pie */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recommended Allocation</p>
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

          {/* Recommendations Table */}
          {recommendations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#1B2A4A]">Top Fund Picks</h2>
                {generatedAt && <span className="text-xs text-gray-400">Generated {new Date(generatedAt).toLocaleDateString('en-IN')}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3 w-10">#</th>
                      <th className="px-4 py-3">Fund</th>
                      <th className="px-4 py-3">Bucket</th>
                      <th className="px-4 py-3">Match Score</th>
                      <th className="px-4 py-3 text-right">SIP/mo</th>
                      <th className="px-4 py-3">Reasons</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recommendations.map(rec => (
                      <tr key={rec.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-bold text-[#1B2A4A]">{rec.rank}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#1B2A4A]">{rec.scheme_name}</p>
                          <p className="text-xs text-gray-400">{rec.category} &middot; {rec.amc}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: BUCKET_COLORS[rec.allocation_bucket] || '#9ca3af' }}>
                            {rec.allocation_bucket}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div className="bg-[#D4A847] h-2 rounded-full" style={{ width: `${(rec.composite_score / 80) * 100}%` }} />
                            </div>
                            <span className="text-xs font-medium text-gray-600">{rec.composite_score}/80</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[#1B2A4A]">{formatCurrency(rec.recommended_sip || 0)}</td>
                        <td className="px-4 py-3">
                          <ul className="space-y-0.5">
                            {(Array.isArray(rec.reasons) ? rec.reasons : []).slice(0, 2).map((r, i) => (
                              <li key={i} className="flex items-start gap-1 text-xs text-gray-500">
                                <Check size={12} className="text-green-500 mt-0.5 shrink-0" /> {r}
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
                      <td className="px-4 py-3 text-right font-bold text-[#D4A847]">{formatCurrency(totalSIP)}</td>
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#D4A847]/50">
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
