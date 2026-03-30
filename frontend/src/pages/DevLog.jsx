import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Copy, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Database, BarChart3, Target, FileText, Users } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function StatCard({ label, value, warn }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${warn ? 'text-red-600' : 'text-[#1B2A4A]'}`}>
        {value}
      </span>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
        <Icon size={18} className="text-[#D4A847]" />
        <h2 className="text-base font-semibold text-[#1B2A4A]">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

export default function DevLog() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/dev/status`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const copyJson = () => {
    if (!data) return
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc] p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1B2A4A]">Dev Log Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              {data ? `Last updated: ${new Date(data.timestamp).toLocaleString()}` : 'Loading...'}
            </p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#243759] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Error: {error}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Database */}
            <SectionCard title="Database" icon={Database}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
                <StatCard label="Total Funds" value={data.database.total_funds.toLocaleString()} />
                <StatCard label="Funds with NAV" value={data.database.funds_with_nav.toLocaleString()} />
                <StatCard label="NAV Cache Schemes" value={data.database.nav_cache_scheme_count.toLocaleString()} />
                <StatCard label="NAV Cache Rows" value={data.database.nav_cache_total_rows.toLocaleString()} />
                <StatCard label="Total Clients" value={data.database.total_clients} />
                <StatCard label="Manual Holdings" value={data.database.total_holdings} />
                <StatCard label="CAS Holdings" value={data.database.total_cas_holdings} />
              </div>
            </SectionCard>

            {/* Metrics */}
            <SectionCard title="Fund Metrics" icon={BarChart3}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
                <StatCard label="Total Computed" value={data.metrics.total_computed.toLocaleString()} />
                <StatCard label="Coverage" value={`${data.metrics.coverage_pct}%`} />
                <StatCard label="With Sortino" value={data.metrics.with_sortino.toLocaleString()} />
                <StatCard label="With Calmar" value={data.metrics.with_calmar.toLocaleString()} />
                <StatCard label="With 3Y Return" value={data.metrics.with_return_3y.toLocaleString()} />
                <StatCard label="With Risk Level" value={data.metrics.with_risk_level.toLocaleString()} />
              </div>

              {/* Corrupt risk level highlight */}
              <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                data.metrics.corrupt_risk_level_count > 0
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {data.metrics.corrupt_risk_level_count > 0
                  ? <AlertTriangle size={16} />
                  : <CheckCircle size={16} />
                }
                {data.metrics.corrupt_risk_level_count > 0
                  ? `⚠️ ${data.metrics.corrupt_risk_level_count} corrupt risk_level entries`
                  : '✓ No corrupt risk_level entries'
                }
              </div>

              {/* Risk level frequency table */}
              {data.metrics.sample_risk_levels.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Risk Level Distribution</h3>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-gray-600 font-medium">Risk Level</th>
                          <th className="text-right px-3 py-2 text-gray-600 font-medium">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.metrics.sample_risk_levels.map((row) => (
                          <tr key={row.risk_level} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-1.5 text-[#1B2A4A] font-mono text-xs">{row.risk_level}</td>
                            <td className="px-3 py-1.5 text-right font-semibold">{row.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Recommendations */}
            <SectionCard title="Recommendations" icon={Target}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
                <StatCard label="Total Stored" value={data.recommendations.total_stored.toLocaleString()} />
                <StatCard label="Clients Scored" value={data.recommendations.clients_scored} />
              </div>
              <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                data.recommendations.with_zero_category_fit > 0
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {data.recommendations.with_zero_category_fit > 0
                  ? <><AlertTriangle size={16} /> {data.recommendations.with_zero_category_fit} recommendations with zero category_fit_score</>
                  : <><CheckCircle size={16} /> All recommendations have non-zero category_fit_score</>
                }
              </div>
            </SectionCard>

            {/* Factsheets */}
            <SectionCard title="Factsheets" icon={FileText}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8">
                <StatCard label="Total Extracted" value={data.factsheets.total_extracted.toLocaleString()} />
                <StatCard label="Matched to Scheme" value={data.factsheets.matched_to_scheme.toLocaleString()} />
                <StatCard label="AMC Sources Total" value={data.factsheets.amc_sources_total} />
                <StatCard label="AMC Extracted" value={data.factsheets.amc_sources_extracted} />
                <StatCard label="AMC Failed" value={data.factsheets.amc_sources_failed} warn={data.factsheets.amc_sources_failed > 0} />
              </div>
            </SectionCard>

            {/* Profiles */}
            <SectionCard title="Client Profiles" icon={Users}>
              <div className="grid grid-cols-2 gap-x-8">
                <StatCard label="Total Profiles" value={data.profiles.total} />
                <StatCard label="Complete" value={data.profiles.complete} />
              </div>
              {data.profiles.sample.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Profiles</h3>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-gray-600 font-medium">Client ID</th>
                          <th className="text-left px-3 py-2 text-gray-600 font-medium">Risk Label</th>
                          <th className="text-right px-3 py-2 text-gray-600 font-medium">Capacity Score</th>
                          <th className="text-center px-3 py-2 text-gray-600 font-medium">Complete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.profiles.sample.map((row) => (
                          <tr key={row.client_id} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-1.5 font-mono text-xs">{row.client_id}</td>
                            <td className="px-3 py-1.5">{row.risk_label || '—'}</td>
                            <td className="px-3 py-1.5 text-right">{row.risk_capacity_score ?? '—'}</td>
                            <td className="px-3 py-1.5 text-center">{row.profile_complete ? '✓' : '✗'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Raw JSON */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {showRaw ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="text-sm font-semibold text-[#1B2A4A]">Raw JSON Response</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); copyJson() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4A847] text-white rounded-md text-xs font-medium hover:bg-[#c49a3c] transition-colors"
                >
                  <Copy size={12} />
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
              </button>
              {showRaw && (
                <div className="px-5 pb-4">
                  <pre className="bg-[#1B2A4A] text-gray-200 p-4 rounded-lg text-xs overflow-x-auto max-h-[500px] overflow-y-auto">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
