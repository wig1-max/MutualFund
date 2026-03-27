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
import { getClientStats, getTotalAum, getLatestNav, downloadBackup, getProfilingSummary } from '../services/api'
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

  useEffect(() => {
    getClientStats().then(setStats).catch(() => {})
    getTotalAum().then(data => setTotalAum(data.totalAum)).catch(() => {})
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
    {
      title: 'Total Clients',
      value: stats ? String(stats.totalClients) : '—',
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Total AUM',
      value: totalAum != null ? formatCurrency(totalAum) : '—',
      icon: IndianRupee,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: 'Reviews Due',
      value: stats ? String(stats.reviewsDueThisWeek) : '—',
      icon: ClipboardCheck,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      title: 'Market Pulse',
      value: 'Nifty 50',
      icon: BarChart3,
      color: 'bg-purple-50 text-purple-600',
      isMarket: true,
    },
  ]

  return (
    <div className="p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A]">Welcome back, Aryan</h1>
          <p className="text-gray-500 mt-1">Here is your practice overview for today.</p>
        </div>
        <button
          onClick={downloadBackup}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]/90 transition-colors"
        >
          <Download size={16} /> Backup DB
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {stat.title}
                  </p>
                  {stat.isMarket ? (
                    <div className="mt-2">
                      <p className="text-2xl font-bold text-[#1B2A4A]">{niftyValue}</p>
                      {niftyDate && <p className="text-[10px] text-gray-400 mt-0.5">NAV as of {niftyDate}</p>}
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-[#1B2A4A] mt-2">{stat.value}</p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <Icon size={20} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Intelligence Signals */}
      {profilingSummary && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4 flex items-center gap-2">
            <Brain size={20} className="text-[#D4A847]" /> Intelligence Signals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Profiled Clients */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Profiled Clients</p>
              <p className="text-2xl font-bold text-[#1B2A4A] mt-2">
                {profilingSummary.profiled_clients}<span className="text-sm text-gray-400 font-normal"> / {profilingSummary.total_clients}</span>
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                <div className="bg-[#D4A847] h-2 rounded-full transition-all" style={{ width: `${profilingSummary.profile_completion_pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{profilingSummary.profile_completion_pct}% complete</p>
            </div>

            {/* Avg Monthly Surplus */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Monthly Surplus</p>
              <p className="text-2xl font-bold text-[#1B2A4A] mt-2">
                {profilingSummary.avg_investable_surplus >= 100000
                  ? `₹${(profilingSummary.avg_investable_surplus / 100000).toFixed(2)} L`
                  : `₹${profilingSummary.avg_investable_surplus.toLocaleString('en-IN')}`}
              </p>
              <p className="text-xs text-gray-400 mt-1">across profiled clients</p>
            </div>

            {/* Risk Distribution */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Risk Distribution</p>
              {profilingSummary.by_risk_label && profilingSummary.by_risk_label.length > 0 ? (
                <div className="space-y-2">
                  {profilingSummary.by_risk_label.map(r => {
                    const maxCount = Math.max(...profilingSummary.by_risk_label.map(x => x.count))
                    return (
                      <div key={r.risk_label} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-28 truncate">{r.risk_label}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-[#1B2A4A] h-2 rounded-full" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-[#1B2A4A] w-6 text-right">{r.count}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No profiles yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {quickActions.map(({ label, icon: Icon, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-col items-center gap-2 bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-[#D4A847]/40 transition-all group"
            >
              <div className="p-3 rounded-lg bg-[#1B2A4A]/5 group-hover:bg-[#D4A847]/10 transition-colors">
                <Icon size={22} className="text-[#1B2A4A] group-hover:text-[#D4A847] transition-colors" />
              </div>
              <span className="text-xs font-medium text-gray-600 text-center leading-tight">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
