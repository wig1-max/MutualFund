import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  IndianRupee,
  ClipboardCheck,
  TrendingUp,
  PieChart,
  FileText,
  Target,
  Calculator,
  BarChart3,
  Download,
  Brain,
} from 'lucide-react'
import { getClientStats, getTotalAum, getLatestNav, downloadBackup, getProfilingSummary, getTotalWealth } from '../services/api'
import { formatCurrency } from '../lib/utils'

const quickActions = [
  { label: 'Fund Intelligence', icon: TrendingUp, to: '/fund-intelligence' },
  { label: 'Portfolio X-Ray', icon: PieChart, to: '/portfolio-xray' },
  { label: 'Report Generator', icon: FileText, to: '/report-generator' },
  { label: 'Goal Planner', icon: Target, to: '/goal-planner' },
  { label: 'Tax Optimizer', icon: Calculator, to: '/tax-optimizer' },
  { label: 'Client CRM', icon: Users, to: '/crm' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [niftyValue, setNiftyValue] = useState('—')
  const [niftyDate, setNiftyDate] = useState('')
  const [stats, setStats] = useState(null)
  const [totalAum, setTotalAum] = useState(null)
  const [profilingSummary, setProfilingSummary] = useState(null)
  const [totalWealth, setTotalWealth] = useState(null)

  useEffect(() => {
    getClientStats().then(setStats).catch(() => {})
    getTotalAum().then(data => setTotalAum(data.totalAum)).catch(() => {})
    getTotalWealth().then(setTotalWealth).catch(() => {})
    getProfilingSummary().then(setProfilingSummary).catch(() => {})
    getLatestNav('100356')
      .then(data => {
        if (data?.data?.[0]) {
          setNiftyValue(`\u20B9${parseFloat(data.data[0].nav).toLocaleString('en-IN')}`)
          setNiftyDate(data.data[0].date)
        }
      })
      .catch(() => setNiftyValue('—'))
  }, [])

  const statCards = [
    { title: 'Total Clients', value: stats ? String(stats.totalClients) : '—', icon: Users, borderColor: 'border-sky-500/40' },
    { title: 'Total AUM', value: totalAum != null ? formatCurrency(totalAum) : '—', icon: IndianRupee, borderColor: 'border-amber-500/40' },
    { title: 'Reviews Due', value: stats ? String(stats.reviewsDueThisWeek) : '—', icon: ClipboardCheck, borderColor: 'border-red-500/40' },
    { title: 'Market Pulse', value: 'Nifty 50', icon: BarChart3, borderColor: 'border-violet-500/40', isMarket: true },
  ]

  return (
    <div className="p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Good morning, Aryan</h1>
          <p className="text-sm text-slate-500 mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={downloadBackup}
          className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] text-slate-300 border border-white/[0.08] rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} /> Backup DB
        </button>
      </div>

      {/* Gold accent bar */}
      <div className="h-px my-6 opacity-30" style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)' }} />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              className={`bg-surface-800 border border-white/[0.07] rounded-xl p-5 border-l-2 ${stat.borderColor}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{stat.title}</p>
                  {stat.isMarket ? (
                    <div className="mt-2">
                      <p className="text-2xl font-bold text-slate-100 data-num">{niftyValue}</p>
                      {niftyDate && <p className="text-[10px] text-slate-600 mt-0.5">NAV as of {niftyDate}</p>}
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-slate-100 mt-2 data-num">{stat.value}</p>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                  <Icon size={16} className="text-slate-500" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total Wealth Card */}
      {totalWealth && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
          <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5 border-l-2 border-emerald-500/40">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Wealth</p>
                <p className="text-2xl font-bold text-slate-100 mt-2 data-num">{formatCurrency(totalWealth.total_estimated)}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">across all clients</p>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <IndianRupee size={16} className="text-emerald-500" />
              </div>
            </div>
          </div>
          <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5 border-l-2 border-sky-500/40">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">MF AUM</p>
                <p className="text-2xl font-bold text-slate-100 mt-2 data-num">{formatCurrency(totalWealth.mf_aum)}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">mutual fund investments</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5 border-l-2 border-violet-500/40">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Other Assets</p>
                <p className="text-2xl font-bold text-slate-100 mt-2 data-num">{formatCurrency(totalWealth.household_estimated)}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">non-MF household assets</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Intelligence Signals */}
      {profilingSummary && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Brain size={16} className="text-amber-400" /> Intelligence Signals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Profiled Clients</p>
              <p className="text-2xl font-bold text-slate-100 mt-2">
                {profilingSummary.profiled_clients}<span className="text-sm text-slate-600 font-normal"> / {profilingSummary.total_clients}</span>
              </p>
              <div className="w-full bg-white/[0.06] rounded-full h-2 mt-3">
                <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${profilingSummary.profile_completion_pct}%` }} />
              </div>
              <p className="text-xs text-slate-600 mt-1">{profilingSummary.profile_completion_pct}% complete</p>
            </div>

            <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Avg Monthly Surplus</p>
              <p className="text-2xl font-bold text-slate-100 mt-2">
                {profilingSummary.avg_investable_surplus >= 100000
                  ? `\u20B9${(profilingSummary.avg_investable_surplus / 100000).toFixed(2)} L`
                  : `\u20B9${profilingSummary.avg_investable_surplus.toLocaleString('en-IN')}`}
              </p>
              <p className="text-xs text-slate-600 mt-1">across profiled clients</p>
            </div>

            <div className="bg-surface-800 border border-white/[0.07] rounded-xl p-5">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-3">Risk Distribution</p>
              {profilingSummary.by_risk_label && profilingSummary.by_risk_label.length > 0 ? (
                <div className="space-y-2">
                  {profilingSummary.by_risk_label.map(r => {
                    const maxCount = Math.max(...profilingSummary.by_risk_label.map(x => x.count))
                    return (
                      <div key={r.risk_label} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-28 truncate">{r.risk_label}</span>
                        <div className="flex-1 bg-white/[0.06] rounded-full h-2">
                          <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-300 w-6 text-right">{r.count}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-600">No profiles yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modules */}
      <div>
        <h2 className="text-sm font-semibold text-slate-100 mb-4">Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {quickActions.map(({ label, icon: Icon, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-col items-center gap-2 bg-surface-700 border border-white/[0.06] rounded-xl p-5 hover:bg-surface-600 hover:border-amber-500/20 transition-all group"
            >
              <div className="p-3 rounded-lg bg-white/[0.04]">
                <Icon size={22} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
              </div>
              <span className="text-xs text-slate-400 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
