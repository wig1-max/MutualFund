import { useState, useEffect } from 'react'
import {
  Wallet, Plus, Pencil, Trash2, Loader2, X,
  PieChart as PieChartIcon, IndianRupee, Landmark, TrendingUp,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useToast } from '../components/Toast'
import { Card, Button, Badge } from '../components/UI'
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

  useEffect(() => {
    api.getClients().then(setClients).catch(err => showToast(err.message, 'error'))
    api.getAssetTypes().then(data => setAssetTypes(data.types || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setAssets([])
      setWealthSummary(null)
      return
    }
    setLoading(true)
    Promise.all([
      api.getClientAssets(selectedClientId),
      api.getWealthSummary(selectedClientId),
    ])
      .then(([assetsData, wealthData]) => {
        setAssets(assetsData.assets || [])
        setWealthSummary(wealthData)
      })
      .catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [selectedClientId])

  const refreshData = async () => {
    if (!selectedClientId) return
    try {
      const [assetsData, wealthData] = await Promise.all([
        api.getClientAssets(selectedClientId),
        api.getWealthSummary(selectedClientId),
      ])
      setAssets(assetsData.assets || [])
      setWealthSummary(wealthData)
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
      {showAddModal && (
        <AssetModal
          clientId={selectedClientId}
          assetTypes={assetTypes}
          editingAsset={editingAsset}
          onClose={() => { setShowAddModal(false); setEditingAsset(null) }}
          onSaved={() => { setShowAddModal(false); setEditingAsset(null); refreshData() }}
        />
      )}
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
function AssetModal({ clientId, assetTypes, editingAsset, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEditing = !!editingAsset
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    asset_type: editingAsset?.asset_type || '',
    asset_subtype: editingAsset?.asset_subtype || '',
    name: editingAsset?.name || '',
    identifier: editingAsset?.identifier || '',
    invested_amount: editingAsset?.invested_amount || '',
    current_value: editingAsset?.current_value || '',
    units: editingAsset?.units || '',
    purchase_date: editingAsset?.purchase_date || '',
    maturity_date: editingAsset?.maturity_date || '',
    interest_rate: editingAsset?.interest_rate || '',
    notes: editingAsset?.notes || '',
  })

  const selectedType = assetTypes.find(t => t.value === form.asset_type)
  const subtypes = selectedType?.subtypes || []

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_type || !form.name) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        invested_amount: form.invested_amount ? parseFloat(form.invested_amount) : 0,
        current_value: form.current_value ? parseFloat(form.current_value) : null,
        units: form.units ? parseFloat(form.units) : null,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        asset_subtype: form.asset_subtype || null,
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
          <h2 className="text-lg font-bold text-slate-100">{isEditing ? 'Edit Asset' : 'Add Asset'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-300"><X size={18} /></button>
        </div>
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
      </div>
    </div>
  )
}
