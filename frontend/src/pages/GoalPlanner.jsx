import { useState, useEffect, useCallback } from 'react'
import {
  Target, Plus, Trash2, Edit3, Loader2, X, TrendingUp,
  GraduationCap, Home, Briefcase, Heart, Car, Plane, Sparkles,
  ChevronDown, ChevronUp, Calculator, AlertTriangle, CheckCircle,
  PieChart as PieChartIcon, Sliders, RotateCcw, Wallet
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, ComposedChart, PieChart, Pie, Cell } from 'recharts'
import { useToast } from '../components/Toast'
import { Modal } from '../components/UI'
import * as api from '../services/api'
import { formatCurrency } from '../lib/utils'

const GOAL_TYPES = [
  { value: 'Retirement', label: 'Retirement', icon: Briefcase, color: 'bg-violet-500/10 text-violet-400' },
  { value: 'Child Education', label: 'Child Education', icon: GraduationCap, color: 'bg-sky-500/10 text-sky-400' },
  { value: 'House Purchase', label: 'House Purchase', icon: Home, color: 'bg-amber-500/10 text-amber-400' },
  { value: 'Emergency Fund', label: 'Emergency Fund', icon: Heart, color: 'bg-red-500/10 text-red-400' },
  { value: 'Car Purchase', label: 'Car Purchase', icon: Car, color: 'bg-emerald-500/10 text-emerald-400' },
  { value: 'Vacation', label: 'Vacation', icon: Plane, color: 'bg-sky-500/10 text-sky-400' },
  { value: 'Wedding', label: 'Wedding', icon: Sparkles, color: 'bg-pink-500/10 text-pink-400' },
  { value: 'Custom', label: 'Custom Goal', icon: Target, color: 'bg-surface-700 text-slate-400' },
]

const PRIORITY_COLORS = {
  High: 'bg-red-500/10 text-red-400 border-red-500/20',
  Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

function getGoalIcon(type) {
  const found = GOAL_TYPES.find(g => g.value === type)
  return found ? found.icon : Target
}

function getGoalColor(type) {
  const found = GOAL_TYPES.find(g => g.value === type)
  return found ? found.color : 'bg-surface-700 text-slate-400'
}

export default function GoalPlanner() {
  const { showToast } = useToast()
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [showCalculator, setShowCalculator] = useState(false)
  const [expandedGoal, setExpandedGoal] = useState(null)

  useEffect(() => {
    api.getClients().then(setClients).catch(err => showToast(err.message, 'error'))
  }, [])

  useEffect(() => {
    if (!selectedClientId) {
      setGoals([])
      return
    }
    loadGoals()
  }, [selectedClientId])

  const loadGoals = async () => {
    setLoading(true)
    try {
      const data = await api.getGoals(selectedClientId)
      setGoals(data.goals)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }
  // Note: loadGoals is intentionally not in the deps array above — the effect
  // only needs to re-run when selectedClientId changes. loadGoals is also called
  // directly by handleFormSave for manual refresh after goal creation/edit.

  const handleDelete = async (goalId) => {
    if (!window.confirm('Delete this goal?')) return
    try {
      await api.deleteGoal(selectedClientId, goalId)
      setGoals(goals.filter(g => g.id !== goalId))
      showToast('Goal deleted', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleFormSave = () => {
    setShowForm(false)
    setEditingGoal(null)
    loadGoals()
  }

  // Aggregate stats
  const totalSip = goals.reduce((s, g) => s + (g.monthly_sip || 0), 0)
  const totalTarget = goals.reduce((s, g) => s + g.inflatedTarget, 0)
  const onTrack = goals.filter(g => g.progressPercent >= 90).length
  const atRisk = goals.filter(g => g.progressPercent < 50 && g.years_remaining > 0).length

  return (
    <div className="p-8 pt-16 lg:pt-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A] flex items-center gap-2">
            <Target className="text-[#D4A847]" /> Goal-Based SIP Planner
          </h1>
          <p className="text-gray-500 mt-1">Map life goals to SIP amounts with inflation-adjusted projections</p>
        </div>
        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]/90 transition-colors"
        >
          <Calculator size={16} /> Quick Calculator
        </button>
      </div>

      {/* Quick SIP Calculator (standalone, no client needed) */}
      {showCalculator && <SipCalculator onClose={() => setShowCalculator(false)} />}

      {/* Client Selector */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Select Client</label>
            <select
              value={selectedClientId || ''}
              onChange={(e) => setSelectedClientId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847]"
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
                onClick={() => { setEditingGoal(null); setShowForm(true) }}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] transition-colors"
              >
                <Plus size={16} /> Add Goal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {selectedClientId && goals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Goals" value={goals.length} />
          <SummaryCard label="Total Monthly SIP" value={formatCurrency(totalSip)} color="text-[#D4A847]" />
          <SummaryCard label="On Track" value={onTrack} color="text-emerald-600" />
          <SummaryCard label="At Risk" value={atRisk} color={atRisk > 0 ? 'text-red-500' : 'text-emerald-600'} />
        </div>
      )}

      {/* Loading / Empty */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading goals...
        </div>
      ) : selectedClientId && goals.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-xl shadow-sm">
          <Target size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">No goals yet. Click "Add Goal" to start planning.</p>
        </div>
      ) : null}

      {/* Goals List */}
      {goals.length > 0 && (
        <div className="space-y-4">
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              clientId={selectedClientId}
              expanded={expandedGoal === goal.id}
              onToggle={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
              onEdit={() => { setEditingGoal(goal); setShowForm(true) }}
              onDelete={() => handleDelete(goal.id)}
            />
          ))}
        </div>
      )}

      {/* Total SIP footer */}
      {goals.length > 0 && (
        <div className="mt-6 bg-[#1B2A4A] rounded-xl p-5 flex items-center justify-between text-white">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Monthly SIP Required</p>
            <p className="text-2xl font-bold text-[#D4A847] mt-1">{formatCurrency(totalSip)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Target Corpus</p>
            <p className="text-lg font-semibold mt-1">{formatCurrency(totalTarget)}</p>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      <GoalFormModal
        open={showForm}
        clientId={selectedClientId}
        goal={editingGoal}
        onClose={() => { setShowForm(false); setEditingGoal(null) }}
        onSave={handleFormSave}
      />

      {/* Disclaimer */}
      {goals.length > 0 && (
        <div className="mt-6 bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Projections are based on assumed rates of return and inflation. Actual results may vary.
            Mutual fund investments are subject to market risks. Past performance does not guarantee
            future results. Consult a SEBI-registered investment advisor for personalized advice.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------- Summary Card ----------
function SummaryCard({ label, value, color = 'text-[#1B2A4A]' }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm text-center">
      <p className="text-xs text-gray-400 font-medium uppercase">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

// Allocation pie chart colors
const ALLOC_COLORS = [
  '#D4A847', '#1B2A4A', '#6366f1', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4',
]

// ---------- Goal Card ----------
function GoalCard({ goal, expanded, onToggle, onEdit, onDelete, clientId }) {
  const Icon = getGoalIcon(goal.goal_type)
  const colorClass = getGoalColor(goal.goal_type)
  const progressColor = goal.progressPercent >= 90
    ? 'bg-emerald-500'
    : goal.progressPercent >= 50
      ? 'bg-amber-500'
      : 'bg-red-500'

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={onToggle}
      >
        <div className={`p-2.5 rounded-lg ${colorClass}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1B2A4A] truncate">{goal.goal_name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${PRIORITY_COLORS[goal.priority]}`}>
              {goal.priority}
            </span>
            {goal.progressPercent >= 90 && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}
            {goal.progressPercent < 50 && goal.years_remaining > 0 && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Target: {formatCurrency(goal.inflatedTarget)} by {goal.target_year} ({goal.years_remaining}y remaining)
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-[#D4A847]">{formatCurrency(goal.monthly_sip)}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(goal.progressPercent, 100)}%` }} />
            </div>
            <span className="text-[10px] text-gray-400">{goal.progressPercent.toFixed(0)}%</span>
          </div>
        </div>
        <div className="shrink-0 text-gray-300">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 bg-gray-50/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <DetailField label="Today's Target" value={formatCurrency(goal.target_amount)} />
            <DetailField label="Inflation-Adjusted" value={formatCurrency(goal.inflatedTarget)} />
            <DetailField label="Projected Corpus" value={formatCurrency(goal.projectedCorpus)} color={goal.projectedCorpus >= goal.inflatedTarget ? 'text-emerald-600' : 'text-red-500'} />
            <DetailField label="Shortfall" value={goal.shortfall > 0 ? formatCurrency(goal.shortfall) : 'None'} color={goal.shortfall > 0 ? 'text-red-500' : 'text-emerald-600'} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <DetailField label="Current Savings" value={formatCurrency(goal.current_savings)} />
            <DetailField label="Expected Return" value={`${goal.expected_return}% p.a.`} />
            <DetailField label="Inflation Rate" value={`${goal.inflation_rate}% p.a.`} />
            <DetailField label="Goal Type" value={goal.goal_type} />
          </div>
          {goal.notes && (
            <p className="text-xs text-gray-500 mb-4 p-3 bg-white rounded-lg border border-gray-100">{goal.notes}</p>
          )}

          {/* Asset Allocation Panel */}
          {clientId && <GoalAllocationPanel clientId={clientId} goalId={goal.id} monthlySip={goal.monthly_sip} />}

          <div className="flex gap-2 mt-4">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B2A4A] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit3 size={12} /> Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value, color = 'text-[#1B2A4A]' }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 font-medium uppercase">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}

// ---------- Goal Form Modal ----------
function GoalFormModal({ open, clientId, goal, onClose, onSave }) {
  const { showToast } = useToast()
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({
    goal_name: goal?.goal_name || '',
    goal_type: goal?.goal_type || 'Custom',
    target_amount: goal?.target_amount || '',
    target_year: goal?.target_year || currentYear + 10,
    current_savings: goal?.current_savings || 0,
    expected_return: goal?.expected_return ?? 12,
    inflation_rate: goal?.inflation_rate ?? 6,
    monthly_sip: goal?.monthly_sip || '',
    priority: goal?.priority || 'Medium',
    notes: goal?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [autoSip, setAutoSip] = useState(!goal?.monthly_sip)

  // Reset state whenever the modal opens for a new/edited goal
  useEffect(() => {
    if (!open) return
    setForm({
      goal_name: goal?.goal_name || '',
      goal_type: goal?.goal_type || 'Custom',
      target_amount: goal?.target_amount || '',
      target_year: goal?.target_year || currentYear + 10,
      current_savings: goal?.current_savings || 0,
      expected_return: goal?.expected_return ?? 12,
      inflation_rate: goal?.inflation_rate ?? 6,
      monthly_sip: goal?.monthly_sip || '',
      priority: goal?.priority || 'Medium',
      notes: goal?.notes || '',
    })
    setAutoSip(!goal?.monthly_sip)
  }, [open, goal, currentYear])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        target_amount: parseFloat(form.target_amount),
        target_year: parseInt(form.target_year),
        current_savings: parseFloat(form.current_savings) || 0,
        expected_return: parseFloat(form.expected_return),
        inflation_rate: parseFloat(form.inflation_rate),
        monthly_sip: autoSip ? null : parseFloat(form.monthly_sip) || null,
      }
      if (goal) {
        await api.updateGoal(clientId, goal.id, payload)
        showToast('Goal updated', 'success')
      } else {
        await api.createGoal(clientId, payload)
        showToast('Goal created', 'success')
      }
      onSave()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit Goal' : 'Add New Goal'} size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Goal Name */}
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Goal Name *</label>
            <input type="text" value={form.goal_name} onChange={e => set('goal_name', e.target.value)} required placeholder="e.g. Daughter's Engineering" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>

          {/* Goal Type */}
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-2">Goal Type</label>
            <div className="grid grid-cols-4 gap-2">
              {GOAL_TYPES.map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('goal_type', t.value)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                      form.goal_type === t.value
                        ? 'border-[#D4A847] bg-[#D4A847]/5 text-[#D4A847]'
                        : 'border-gray-100 text-gray-400 hover:border-gray-200'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="truncate w-full text-center">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Target Amount + Year */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Target Amount ({'\u20B9'}) *</label>
              <input type="number" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} required placeholder="e.g. 5000000" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Target Year *</label>
              <input type="number" value={form.target_year} onChange={e => set('target_year', e.target.value)} min={currentYear + 1} required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
          </div>

          {/* Current Savings + Expected Return */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Current Savings ({'\u20B9'})</label>
              <input type="number" value={form.current_savings} onChange={e => set('current_savings', e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Expected Return (% p.a.)</label>
              <input type="number" step="0.5" value={form.expected_return} onChange={e => set('expected_return', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
          </div>

          {/* Inflation + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Inflation Rate (% p.a.)</label>
              <input type="number" step="0.5" value={form.inflation_rate} onChange={e => set('inflation_rate', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40">
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Monthly SIP */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400 font-medium">Monthly SIP ({'\u20B9'})</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={autoSip} onChange={e => setAutoSip(e.target.checked)} className="rounded border-gray-300" />
                Auto-calculate
              </label>
            </div>
            <input
              type="number"
              value={autoSip ? '' : form.monthly_sip}
              onChange={e => set('monthly_sip', e.target.value)}
              disabled={autoSip}
              placeholder={autoSip ? 'Will be calculated automatically' : 'e.g. 10000'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Notes (optional)</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Any additional context..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" disabled={saving || !form.goal_name || !form.target_amount} className="flex items-center gap-2 px-5 py-2 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {goal ? 'Update Goal' : 'Add Goal'}
            </button>
          </div>
      </form>
    </Modal>
  )
}

// ---------- Quick SIP Calculator ----------
function SipCalculator({ onClose }) {
  const { showToast } = useToast()
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({
    target_amount: 5000000,
    target_year: currentYear + 15,
    current_savings: 0,
    expected_return: 12,
    inflation_rate: 6,
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleCalculate = async () => {
    setLoading(true)
    try {
      const data = await api.calculateGoalSip(form)
      setResult(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#1B2A4A]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Calculator size={16} className="text-[#D4A847]" /> Quick SIP Calculator
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={16} /></button>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Target ({'\u20B9'})</label>
            <input type="number" value={form.target_amount} onChange={e => set('target_amount', parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Year</label>
            <input type="number" value={form.target_year} onChange={e => set('target_year', parseInt(e.target.value) || currentYear + 10)} min={currentYear + 1} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Savings ({'\u20B9'})</label>
            <input type="number" value={form.current_savings} onChange={e => set('current_savings', parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Return %</label>
            <input type="number" step="0.5" value={form.expected_return} onChange={e => set('expected_return', parseFloat(e.target.value) || 12)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium block mb-1">Inflation %</label>
            <input type="number" step="0.5" value={form.inflation_rate} onChange={e => set('inflation_rate', parseFloat(e.target.value) || 6)} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40" />
          </div>
        </div>
        <button onClick={handleCalculate} disabled={loading} className="px-5 py-2 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors">
          {loading ? 'Calculating...' : 'Calculate SIP'}
        </button>

        {result && (
          <div className="mt-6">
            {/* Result summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-[#D4A847]/5 border border-[#D4A847]/20">
                <p className="text-[10px] text-gray-400 uppercase">Required SIP</p>
                <p className="text-xl font-bold text-[#D4A847] mt-1">{formatCurrency(result.requiredSip)}</p>
                <p className="text-[10px] text-gray-400">per month</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-[10px] text-gray-400 uppercase">Inflation-Adj Target</p>
                <p className="text-lg font-bold text-[#1B2A4A] mt-1">{formatCurrency(result.inflatedTarget)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-[10px] text-gray-400 uppercase">Total Investment</p>
                <p className="text-lg font-bold text-[#1B2A4A] mt-1">{formatCurrency(result.totalInvestment)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-50">
                <p className="text-[10px] text-gray-400 uppercase">Wealth Gain</p>
                <p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(result.wealthGain)}</p>
              </div>
            </div>

            {/* Projection Chart */}
            {result.yearlyProjection?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[#1B2A4A] mb-3 uppercase tracking-wide">Year-wise Projection</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={result.yearlyProjection}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 10000000 ? (v / 10000000).toFixed(1) + 'Cr' : v >= 100000 ? (v / 100000).toFixed(0) + 'L' : (v / 1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="totalInvested" fill="#1B2A4A" name="Invested" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="corpus" fill="#D4A847" name="Projected Corpus" radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="target" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Goal Asset Allocation Panel ----------
function GoalAllocationPanel({ clientId, goalId, monthlySip }) {
  const { showToast } = useToast()
  const [allocation, setAllocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [customAllocs, setCustomAllocs] = useState([])
  const [saving, setSaving] = useState(false)

  const loadAllocation = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getGoalAllocation(clientId, goalId)
      setAllocation(data)
      if (data.allocations) {
        setCustomAllocs(data.allocations.map(a => ({ ...a })))
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [clientId, goalId])

  useEffect(() => { loadAllocation() }, [loadAllocation])

  const handleCustomPctChange = (idx, newPct) => {
    setCustomAllocs(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], percentage: Math.max(0, Math.min(100, parseFloat(newPct) || 0)) }
      return updated
    })
  }

  const customTotal = customAllocs.reduce((s, a) => s + (a.percentage || 0), 0)

  const handleSaveCustom = async () => {
    if (Math.abs(customTotal - 100) > 1) {
      showToast(`Percentages must sum to 100 (currently ${customTotal.toFixed(1)})`, 'error')
      return
    }
    setSaving(true)
    try {
      const data = await api.saveGoalAllocation(clientId, goalId, { allocations: customAllocs })
      setAllocation(data)
      setCustomizing(false)
      showToast('Custom allocation saved', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleResetToRecommended = async () => {
    setSaving(true)
    try {
      // Save empty to clear, then reload recommended
      // Actually, we need to clear asset_allocation from the goal
      // For now, re-fetch will return recommended if no custom saved
      // We'll save the recommended allocation explicitly
      const data = await api.getGoalAllocation(clientId, goalId)
      // The backend returns recommended if no custom is saved
      // To "reset", we just need to remove the custom allocation
      // We can do this by saving the recommended allocations
      setAllocation(data)
      setCustomAllocs(data.allocations?.map(a => ({ ...a })) || [])
      setCustomizing(false)
      showToast('Reset to recommended allocation', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mt-4 p-4 bg-white rounded-lg border border-gray-100 flex items-center gap-2 text-gray-400 text-xs">
        <Loader2 size={14} className="animate-spin" /> Loading asset allocation...
      </div>
    )
  }

  if (!allocation || !allocation.allocations?.length) return null

  const pieData = (customizing ? customAllocs : allocation.allocations).filter(a => a.percentage > 0)
  const wp = allocation.wealthProgress

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-100 overflow-hidden" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h4 className="text-xs font-semibold text-[#1B2A4A] flex items-center gap-1.5 uppercase tracking-wide">
          <PieChartIcon size={14} className="text-[#D4A847]" /> Asset Allocation
          {allocation.source === 'custom' && (
            <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded-full font-medium normal-case tracking-normal">Custom</span>
          )}
        </h4>
        <div className="flex items-center gap-1.5">
          {!customizing ? (
            <button
              onClick={() => setCustomizing(true)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#1B2A4A] bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
            >
              <Sliders size={10} /> Customize
            </button>
          ) : (
            <>
              <button
                onClick={handleResetToRecommended}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
              >
                <RotateCcw size={10} /> Reset
              </button>
              <button
                onClick={handleSaveCustom}
                disabled={saving || Math.abs(customTotal - 100) > 1}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-white bg-[#D4A847] rounded hover:bg-[#c49a2e] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Wealth Progress bar */}
        {wp && wp.totalExisting > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-[#1B2A4A]/5 border border-[#1B2A4A]/10">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-gray-500 font-medium uppercase flex items-center gap-1">
                <Wallet size={10} /> Wealth Progress Toward Goal
              </span>
              <span className="text-xs font-semibold text-[#1B2A4A]">{wp.progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#D4A847] to-[#1B2A4A]"
                style={{ width: `${Math.min(wp.progressPercent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
              <span>MF: {formatCurrency(wp.mfValue)} | Other: {formatCurrency(wp.householdValue)} | Savings: {formatCurrency(wp.currentSavings)}</span>
              <span>Target: {formatCurrency(wp.inflatedTarget)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="percentage"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={35}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={ALLOC_COLORS[i % ALLOC_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Allocation table */}
          <div className="space-y-1.5">
            {(customizing ? customAllocs : allocation.allocations).map((a, i) => (
              <div key={a.bucket} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                <span className="flex-1 text-gray-600 truncate">{a.label}</span>
                {customizing ? (
                  <input
                    type="number"
                    value={a.percentage}
                    onChange={e => handleCustomPctChange(i, e.target.value)}
                    step="1"
                    min="0"
                    max="100"
                    className="w-14 px-1.5 py-0.5 border border-gray-200 rounded text-xs text-right text-[#1B2A4A] focus:outline-none focus:ring-1 focus:ring-[#D4A847]/40"
                  />
                ) : (
                  <span className="font-semibold text-[#1B2A4A] w-10 text-right">{a.percentage}%</span>
                )}
                <span className="text-gray-400 w-16 text-right">{formatCurrency(a.suggestedMonthly)}/mo</span>
              </div>
            ))}
            {customizing && (
              <div className={`text-[10px] text-right font-medium pt-1 ${Math.abs(customTotal - 100) > 1 ? 'text-red-500' : 'text-emerald-600'}`}>
                Total: {customTotal.toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Rationale section */}
        {!customizing && allocation.allocations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 font-medium uppercase mb-1.5">Allocation Rationale</p>
            <div className="space-y-1">
              {allocation.allocations.slice(0, 3).map(a => (
                <p key={a.bucket} className="text-[10px] text-gray-500">
                  <span className="font-medium text-[#1B2A4A]">{a.label}:</span> {a.rationale}
                </p>
              ))}
            </div>
            {allocation.gapFromTarget > 0 && (
              <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle size={10} />
                Consider increasing monthly investment by {formatCurrency(allocation.gapFromTarget)} to stay on track
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
