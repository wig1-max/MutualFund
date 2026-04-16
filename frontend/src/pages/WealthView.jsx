import { useState, useEffect } from 'react'
import {
  Wallet, Plus, Pencil, Trash2, Loader2,
  PieChart as PieChartIcon, IndianRupee, Landmark, TrendingUp,
  ShieldAlert, ShieldCheck, Banknote,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useToast } from '../components/Toast'
import { Card, Button, Badge, Modal } from '../components/UI'
import * as api from '../services/api'
import { formatCurrency } from '../lib/utils'

const PIE_COLORS = ['#38bdf8', '#fbbf24', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export default function WealthView() {
  const { showToast } = useToast()
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [assets, setAssets] = useState([])
  const [wealthSummary, setWealthSummary] = useState(null)
  const [assetTypes, setAssetTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  // Loan state
  const [loans, setLoans] = useState([])
  const [loanSummary, setLoanSummary] = useState(null)
  const [loanTypes, setLoanTypes] = useState([])
  const [showLoanModal, setShowLoanModal] = useState(false)
  const [editingLoan, setEditingLoan] = useState(null)

  useEffect(() => {
    api.getClients().then(setClients).catch(err => showToast(err.message, 'error'))
    api.getAssetTypes().then(data => setAssetTypes(data.types || [])).catch(() => {})
    api.getLoanTypes().then(data => setLoanTypes(data.types || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setAssets([])
      setWealthSummary(null)
      setLoans([])
      setLoanSummary(null)
      return
    }
    setLoading(true)
    Promise.all([
      api.getClientAssets(selectedClientId),
      api.getWealthSummary(selectedClientId),
      api.getClientLoans(selectedClientId),
    ])
      .then(([assetsData, wealthData, loanData]) => {
        setAssets(assetsData.assets || [])
        setWealthSummary(wealthData)
        setLoans(loanData.loans || [])
        setLoanSummary(loanData.summary || null)
      })
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [selectedClientId])

  const refreshData = async () => {
    if (!selectedClientId) return
    try {
      const [assetsData, wealthData, loanData] = await Promise.all([
        api.getClientAssets(selectedClientId),
        api.getWealthSummary(selectedClientId),
        api.getClientLoans(selectedClientId),
      ])
      setAssets(assetsData.assets || [])
      setWealthSummary(wealthData)
      setLoans(loanData.loans || [])
      setLoanSummary(loanData.summary || null)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDeleteLoan = async (loanId) => {
    if (!window.confirm('Delete this loan?')) return
    try {
      await api.deleteClientLoan(selectedClientId, loanId)
      showToast('Loan deleted', 'success')
      refreshData()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDelete = async (assetId) => {
    if (!window.confirm('Delete this asset?')) return
    try {
      await api.deleteClientAsset(selectedClientId, assetId)
      showToast('Asset deleted', 'success')
      refreshData()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const summary = wealthSummary?.summary
  const buckets = wealthSummary?.buckets || []

  return (
    <div className="p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="text-amber-400" /> Wealth Overview
          </h1>
          <p className="text-slate-500 mt-1">Unified view of all household assets — mutual funds and beyond</p>
        </div>
      </div>

      {/* Client Selector */}
      <Card className="p-5 shadow-sm mb-6">
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
            <div className="pt-5">
              <button
                onClick={() => { setEditingAsset(null); setShowAddModal(true) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-ink-900 rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors"
              >
                <Plus size={16} /> Add Asset
              </button>
            </div>
          )}
        </div>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading wealth data...
        </div>
      )}

      {!loading && selectedClientId && summary && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Invested" value={formatCurrency(summary.total_invested)} icon={IndianRupee} borderColor="border-amber-500/40" />
            <StatCard label="Estimated Value" value={formatCurrency(summary.total_estimated_value)} icon={TrendingUp} borderColor="border-emerald-500/40" />
            <StatCard
              label="Mutual Funds"
              value={formatCurrency(summary.mf_invested)}
              sub={`${summary.mf_holdings_count} holdings`}
              icon={PieChartIcon}
              borderColor="border-sky-500/40"
            />
            <StatCard
              label="Other Assets"
              value={formatCurrency(summary.household_estimated_value)}
              sub={`${summary.household_assets_count} assets`}
              icon={Landmark}
              borderColor="border-violet-500/40"
            />
          </div>

          {/* Insurance Coverage Banner */}
          {wealthSummary?.insurance && (
            <InsuranceBanner insurance={wealthSummary.insurance} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Allocation Pie Chart */}
            {buckets.length > 0 && (
              <Card className="p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-100 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <PieChartIcon size={14} /> Wealth Allocation
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={buckets}
                      dataKey="estimated_value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
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
              </Card>
            )}

            {/* Allocation Breakdown */}
            {buckets.length > 0 && (
              <Card className="p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-100 mb-4 uppercase tracking-wide">
                  Allocation Breakdown
                </h3>
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
              </Card>
            )}
          </div>

          {/* Non-MF Assets Table */}
          <Card className="shadow-sm overflow-hidden">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">Household Assets (Non-MF)</h3>
              <span className="text-xs text-slate-500">{assets.length} asset{assets.length !== 1 ? 's' : ''}</span>
            </div>
            {assets.length === 0 ? (
              <div className="text-center py-16">
                <Landmark size={40} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No household assets added yet.</p>
                <p className="text-slate-600 text-xs mt-1">Click "Add Asset" to record stocks, FDs, insurance, real estate, and more.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                      <th className="text-left p-4 text-slate-400 font-medium">Name</th>
                      <th className="text-left p-4 text-slate-400 font-medium">Type</th>
                      <th className="text-right p-4 text-slate-400 font-medium">Invested</th>
                      <th className="text-right p-4 text-slate-400 font-medium">Est. Value</th>
                      <th className="text-right p-4 text-slate-400 font-medium">Rate / Maturity</th>
                      <th className="text-right p-4 text-slate-400 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(a => (
                      <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                        <td className="p-4">
                          <p className="font-medium text-slate-100 truncate max-w-[200px]">{a.name}</p>
                          {a.identifier && <p className="text-[10px] text-slate-500 mt-0.5">{a.identifier}</p>}
                        </td>
                        <td className="p-4">
                          <Badge variant="gold">{getTypeLabel(assetTypes, a.asset_type)}</Badge>
                          {a.asset_subtype && <span className="text-[10px] text-slate-500 ml-1.5">{a.asset_subtype}</span>}
                        </td>
                        <td className="p-4 text-right text-slate-100">{formatCurrency(a.invested_amount || 0)}</td>
                        <td className="p-4 text-right font-medium text-emerald-400">{formatCurrency(a.estimated_value || 0)}</td>
                        <td className="p-4 text-right text-slate-500 text-xs">
                          {a.interest_rate ? `${a.interest_rate}%` : ''}
                          {a.interest_rate && a.maturity_date ? ' · ' : ''}
                          {a.maturity_date || ''}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditingAsset(a); setShowAddModal(true) }}
                              className="text-slate-600 hover:text-amber-400 transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Loans / Liabilities Section */}
          <Card className="shadow-sm overflow-hidden mt-6">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Banknote size={14} /> Loans & EMIs
                </h3>
                {loanSummary && loanSummary.count > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    {loanSummary.count} loan{loanSummary.count !== 1 ? 's' : ''}
                    {' · '}
                    Total EMI: <span className="text-slate-200 font-medium">{formatCurrency(loanSummary.total_emi)}/mo</span>
                    {' · '}
                    Outstanding: <span className="text-slate-200 font-medium">{formatCurrency(loanSummary.total_outstanding)}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setEditingLoan(null); setShowLoanModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-ink-900 rounded-lg text-xs font-medium hover:bg-amber-400 transition-colors"
              >
                <Plus size={14} /> Add Loan
              </button>
            </div>
            {loans.length === 0 ? (
              <div className="text-center py-12">
                <Banknote size={36} className="mx-auto text-slate-600 mb-2" />
                <p className="text-slate-400 text-sm">No loans recorded.</p>
                <p className="text-slate-600 text-xs mt-1">EMIs tracked here feed into the client's risk capacity.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                      <th className="text-left p-4 text-slate-400 font-medium">Type</th>
                      <th className="text-left p-4 text-slate-400 font-medium">Lender</th>
                      <th className="text-right p-4 text-slate-400 font-medium">EMI / Mo</th>
                      <th className="text-right p-4 text-slate-400 font-medium">Outstanding</th>
                      <th className="text-right p-4 text-slate-400 font-medium">Rate</th>
                      <th className="text-right p-4 text-slate-400 font-medium">Remaining</th>
                      <th className="text-right p-4 text-slate-400 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map(l => (
                      <tr key={l.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                        <td className="p-4">
                          <Badge variant="gold">
                            {(loanTypes.find(t => t.value === l.loan_type)?.label) || l.loan_type}
                          </Badge>
                        </td>
                        <td className="p-4 text-slate-200">{l.lender || '—'}</td>
                        <td className="p-4 text-right font-medium text-red-400">{formatCurrency(l.emi_amount || 0)}</td>
                        <td className="p-4 text-right text-slate-100">{l.outstanding_amount ? formatCurrency(l.outstanding_amount) : '—'}</td>
                        <td className="p-4 text-right text-slate-400">{l.interest_rate ? `${l.interest_rate}%` : '—'}</td>
                        <td className="p-4 text-right text-slate-500 text-xs">
                          {l.remaining_months ? `${l.remaining_months} mo` : l.end_date || '—'}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditingLoan(l); setShowLoanModal(true) }}
                              className="text-slate-600 hover:text-amber-400 transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteLoan(l.id)}
                              className="text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {!loading && selectedClientId && !summary && (
        <Card className="text-center py-16">
          <Wallet size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No wealth data available for this client.</p>
        </Card>
      )}

      {!selectedClientId && !loading && (
        <Card className="text-center py-16">
          <Wallet size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">Select a client to view their household wealth.</p>
        </Card>
      )}

      {/* Add / Edit Asset Modal */}
      <AssetModal
        open={showAddModal}
        clientId={selectedClientId}
        assetTypes={assetTypes}
        editingAsset={editingAsset}
        onClose={() => { setShowAddModal(false); setEditingAsset(null) }}
        onSaved={() => { setShowAddModal(false); setEditingAsset(null); refreshData() }}
      />

      {/* Add / Edit Loan Modal */}
      <LoanModal
        open={showLoanModal}
        clientId={selectedClientId}
        loanTypes={loanTypes}
        editingLoan={editingLoan}
        onClose={() => { setShowLoanModal(false); setEditingLoan(null) }}
        onSaved={() => { setShowLoanModal(false); setEditingLoan(null); refreshData() }}
      />
    </div>
  )
}

// ---------- Insurance Coverage Banner ----------
function InsuranceBanner({ insurance }) {
  const {
    life_cover_status, total_life_cover, target_life_cover, life_cover_gap,
    life_cover_ratio, health_cover_status, total_health_cover,
    policy_count, target_life_multiple,
  } = insurance

  // Banner style + copy keyed off status
  const STATUS_STYLES = {
    unknown:  { tone: 'slate',   icon: ShieldAlert, title: 'Insurance coverage — income data missing' },
    missing:  { tone: 'red',     icon: ShieldAlert, title: 'No life insurance on file' },
    under:    { tone: 'red',     icon: ShieldAlert, title: 'Life cover significantly below target' },
    low:      { tone: 'amber',   icon: ShieldAlert, title: 'Life cover below recommended 10x income' },
    adequate: { tone: 'emerald', icon: ShieldCheck, title: 'Life cover meets recommended 10x income' },
  }
  const config = STATUS_STYLES[life_cover_status] || STATUS_STYLES.unknown
  const Icon = config.icon

  const toneClasses = {
    red:     'bg-red-500/10 border-red-500/30 text-red-300',
    amber:   'bg-amber-500/10 border-amber-500/30 text-amber-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    slate:   'bg-slate-500/10 border-slate-500/30 text-slate-300',
  }[config.tone]

  const description =
    life_cover_status === 'unknown'
      ? 'Add monthly income in the client profile to evaluate life cover adequacy.'
      : life_cover_status === 'missing'
        ? `Recommended life cover is ${formatCurrency(target_life_cover)} (${target_life_multiple}x annual income). No life policies recorded.`
        : life_cover_status === 'adequate'
          ? `${formatCurrency(total_life_cover)} cover is ${life_cover_ratio}x annual income — at or above the ${target_life_multiple}x target.`
          : `Current cover ${formatCurrency(total_life_cover)} (${life_cover_ratio}x income) vs target ${formatCurrency(target_life_cover)}. Gap: ${formatCurrency(life_cover_gap)}.`

  const healthNote =
    health_cover_status === 'covered'
      ? `Health cover on file: ${formatCurrency(total_health_cover)}.`
      : 'No health insurance policy on file.'

  return (
    <div className={`border rounded-xl p-4 mb-6 ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{config.title}</h3>
            <span className="text-[11px] opacity-70">{policy_count} polic{policy_count === 1 ? 'y' : 'ies'} on file</span>
          </div>
          <p className="text-xs mt-1 opacity-90">{description}</p>
          <p className="text-xs mt-1 opacity-80">{healthNote}</p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, borderColor }) {
  return (
    <div className={`bg-surface-800 border border-white/[0.07] rounded-xl p-5 border-l-2 ${borderColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-slate-100 mt-2 data-num">{value}</p>
          {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <Icon size={16} className="text-slate-500" />
        </div>
      </div>
    </div>
  )
}

function getTypeLabel(assetTypes, typeKey) {
  const found = assetTypes.find(t => t.value === typeKey)
  return found ? found.label : typeKey
}

// ---------- Add / Edit Asset Modal ----------
function AssetModal({ open, clientId, assetTypes, editingAsset, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEditing = !!editingAsset
  const [saving, setSaving] = useState(false)

  const buildInitialForm = (asset) => {
    const meta = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {}
    return {
      asset_type: asset?.asset_type || '',
      asset_subtype: asset?.asset_subtype || '',
      name: asset?.name || '',
      identifier: asset?.identifier || '',
      invested_amount: asset?.invested_amount || '',
      current_value: asset?.current_value || '',
      units: asset?.units || '',
      purchase_date: asset?.purchase_date || '',
      maturity_date: asset?.maturity_date || '',
      interest_rate: asset?.interest_rate || '',
      notes: asset?.notes || '',
      // Insurance-specific metadata fields
      sum_assured: meta.sum_assured ?? '',
      annual_premium: meta.annual_premium ?? '',
      premium_frequency: meta.premium_frequency || 'Annual',
      insurer: meta.insurer || '',
      policy_number: meta.policy_number || '',
    }
  }

  const [form, setForm] = useState(buildInitialForm(editingAsset))

  // Reset form when a new asset is selected for editing
  useEffect(() => {
    if (!open) return
    setForm(buildInitialForm(editingAsset))
  }, [open, editingAsset])

  const selectedType = assetTypes.find(t => t.value === form.asset_type)
  const subtypes = selectedType?.subtypes || []

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_type || !form.name) return
    setSaving(true)
    try {
      // Build metadata object for insurance-specific fields
      let metadata = null
      if (form.asset_type === 'insurance') {
        metadata = {
          sum_assured:       form.sum_assured ? parseFloat(form.sum_assured) : null,
          annual_premium:    form.annual_premium ? parseFloat(form.annual_premium) : null,
          premium_frequency: form.premium_frequency || null,
          insurer:           form.insurer || null,
          policy_number:     form.policy_number || null,
        }
      }

      const payload = {
        ...form,
        invested_amount: form.invested_amount ? parseFloat(form.invested_amount) : 0,
        current_value: form.current_value ? parseFloat(form.current_value) : null,
        units: form.units ? parseFloat(form.units) : null,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        asset_subtype: form.asset_subtype || null,
        ...(metadata ? { metadata } : {}),
      }
      if (isEditing) {
        await api.updateClientAsset(clientId, editingAsset.id, payload)
        showToast('Asset updated', 'success')
      } else {
        await api.addClientAsset(clientId, payload)
        showToast('Asset added', 'success')
      }
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Asset' : 'Add Asset'} size="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Asset Type *</label>
              <select
                value={form.asset_type}
                onChange={(e) => { update('asset_type', e.target.value); update('asset_subtype', '') }}
                required
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              >
                <option value="">Select type...</option>
                {assetTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {subtypes.length > 0 && (
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">Subtype</label>
                <select
                  value={form.asset_subtype}
                  onChange={(e) => update('asset_subtype', e.target.value)}
                  className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                >
                  <option value="">Select subtype...</option>
                  {subtypes.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">Name *</label>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. HDFC Bank FD, SBI Gold Bond 2024"
              required
              className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
            />
          </div>

          {/* Insurance-specific fields */}
          {form.asset_type === 'insurance' && (
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Policy Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Sum Assured ({'\u20B9'})</label>
                  <input
                    type="number"
                    value={form.sum_assured}
                    onChange={(e) => update('sum_assured', e.target.value)}
                    placeholder="e.g. 10000000"
                    className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Insurer</label>
                  <input
                    value={form.insurer}
                    onChange={(e) => update('insurer', e.target.value)}
                    placeholder="e.g. HDFC Life, LIC"
                    className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Premium ({'\u20B9'})</label>
                  <input
                    type="number"
                    value={form.annual_premium}
                    onChange={(e) => update('annual_premium', e.target.value)}
                    placeholder="per period"
                    className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Frequency</label>
                  <select
                    value={form.premium_frequency}
                    onChange={(e) => update('premium_frequency', e.target.value)}
                    className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Half-yearly">Half-yearly</option>
                    <option value="Annual">Annual</option>
                    <option value="One-time">One-time</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1.5">Policy Number</label>
                  <input
                    value={form.policy_number}
                    onChange={(e) => update('policy_number', e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-400 font-medium block mb-1.5">Identifier (Folio/Account No.)</label>
            <input
              value={form.identifier}
              onChange={(e) => update('identifier', e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Invested Amount ({'\u20B9'})</label>
              <input
                type="number"
                value={form.invested_amount}
                onChange={(e) => update('invested_amount', e.target.value)}
                placeholder="e.g. 500000"
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Current Value ({'\u20B9'})</label>
              <input
                type="number"
                value={form.current_value}
                onChange={(e) => update('current_value', e.target.value)}
                placeholder="Auto-estimated if blank"
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Units / Qty</label>
              <input
                type="number"
                step="0.001"
                value={form.units}
                onChange={(e) => update('units', e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Interest Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.interest_rate}
                onChange={(e) => update('interest_rate', e.target.value)}
                placeholder="e.g. 7.1"
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Maturity Date</label>
              <input
                type="date"
                value={form.maturity_date}
                onChange={(e) => update('maturity_date', e.target.value)}
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Purchase Date</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => update('purchase_date', e.target.value)}
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Optional notes"
                className="w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300">Cancel</button>
            <button
              type="submit"
              disabled={!form.asset_type || !form.name || saving}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-ink-900 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {isEditing ? 'Update Asset' : 'Add Asset'}
            </button>
          </div>
      </form>
    </Modal>
  )
}

// ---------- Add / Edit Loan Modal ----------
function LoanModal({ open, clientId, loanTypes, editingLoan, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEditing = !!editingLoan
  const [saving, setSaving] = useState(false)

  const buildInitial = (l) => ({
    loan_type:          l?.loan_type          || 'home',
    lender:             l?.lender             || '',
    principal_amount:   l?.principal_amount   ?? '',
    outstanding_amount: l?.outstanding_amount ?? '',
    emi_amount:         l?.emi_amount         ?? '',
    interest_rate:      l?.interest_rate      ?? '',
    tenure_months:      l?.tenure_months      ?? '',
    remaining_months:   l?.remaining_months   ?? '',
    start_date:         l?.start_date         || '',
    end_date:           l?.end_date           || '',
    notes:              l?.notes              || '',
  })

  const [form, setForm] = useState(buildInitial(editingLoan))

  useEffect(() => {
    if (!open) return
    setForm(buildInitial(editingLoan))
  }, [open, editingLoan])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.loan_type || form.emi_amount === '' || isNaN(Number(form.emi_amount))) return
    setSaving(true)
    try {
      const payload = {
        loan_type:          form.loan_type,
        lender:             form.lender || null,
        principal_amount:   form.principal_amount   !== '' ? parseFloat(form.principal_amount)   : null,
        outstanding_amount: form.outstanding_amount !== '' ? parseFloat(form.outstanding_amount) : null,
        emi_amount:         parseFloat(form.emi_amount),
        interest_rate:      form.interest_rate      !== '' ? parseFloat(form.interest_rate)      : null,
        tenure_months:      form.tenure_months      !== '' ? parseInt(form.tenure_months, 10)    : null,
        remaining_months:   form.remaining_months   !== '' ? parseInt(form.remaining_months, 10) : null,
        start_date:         form.start_date || null,
        end_date:           form.end_date || null,
        notes:              form.notes || null,
      }
      if (isEditing) {
        await api.updateClientLoan(clientId, editingLoan.id, payload)
        showToast('Loan updated', 'success')
      } else {
        await api.addClientLoan(clientId, payload)
        showToast('Loan added', 'success')
      }
      onSaved()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 bg-surface-700 border border-white/[0.07] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20'
  const labelClass = 'text-xs text-slate-400 font-medium block mb-1.5'

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Loan' : 'Add Loan'} size="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Loan Type *</label>
            <select
              value={form.loan_type}
              onChange={(e) => update('loan_type', e.target.value)}
              required
              className={inputClass}
            >
              {loanTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Lender</label>
            <input
              value={form.lender}
              onChange={(e) => update('lender', e.target.value)}
              placeholder="e.g. HDFC Bank"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Monthly EMI ({'\u20B9'}) *</label>
            <input
              type="number"
              step="1"
              value={form.emi_amount}
              onChange={(e) => update('emi_amount', e.target.value)}
              placeholder="e.g. 25000"
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Principal ({'\u20B9'})</label>
            <input
              type="number"
              value={form.principal_amount}
              onChange={(e) => update('principal_amount', e.target.value)}
              placeholder="Original amount"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Outstanding ({'\u20B9'})</label>
            <input
              type="number"
              value={form.outstanding_amount}
              onChange={(e) => update('outstanding_amount', e.target.value)}
              placeholder="Remaining"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Interest Rate (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.interest_rate}
              onChange={(e) => update('interest_rate', e.target.value)}
              placeholder="e.g. 8.5"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Tenure (mo)</label>
            <input
              type="number"
              value={form.tenure_months}
              onChange={(e) => update('tenure_months', e.target.value)}
              placeholder="e.g. 240"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Remaining (mo)</label>
            <input
              type="number"
              value={form.remaining_months}
              onChange={(e) => update('remaining_months', e.target.value)}
              placeholder="e.g. 180"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => update('start_date', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End Date</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => update('end_date', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <input
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300">Cancel</button>
          <button
            type="submit"
            disabled={saving || !form.loan_type || form.emi_amount === ''}
            className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-ink-900 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {isEditing ? 'Update Loan' : 'Add Loan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
