import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check, Wallet, Users, Brain, Target, PiggyBank, BadgeCheck, Loader2 } from 'lucide-react'
import { useToast } from '../components/Toast'
import { formatCurrency } from '../lib/utils'
import * as api from '../services/api'

const STEPS = [
  { key: 'income', label: 'Income & Cashflow', icon: Wallet },
  { key: 'life', label: 'Life Situation', icon: Users },
  { key: 'behavior', label: 'Investment Behavior', icon: Brain },
  { key: 'goals', label: 'Goals & Horizon', icon: Target },
  { key: 'assets', label: 'Existing Assets', icon: PiggyBank },
]

const INCOME_TYPES = ['Salaried', 'Business', 'Freelance', 'Retired', 'Other']
const TAX_SLABS = ['0%', '5%', '10%', '15%', '20%', '30%']
const GOAL_OPTIONS = ['Wealth Creation', 'Retirement', 'Child Education', 'House Purchase', 'Emergency Fund', 'Car Purchase', 'Vacation', 'Wedding']

// All sliders use a 1-5 Likert scale where higher = greater risk tolerance.
// Keep in sync with QUESTION_KEYS in backend/services/profileAnalyzer.js
const SLIDER_LABELS = {
  market_fall_reaction:        { left: 'Panic sell',     right: 'Buy more',       label: 'If your portfolio drops 20% in a month, you would...' },
  loss_tolerance:              { left: 'No tolerance',   right: 'Very high',      label: 'How much temporary loss can you stomach?' },
  investment_experience:       { left: 'First time',     right: 'Expert',         label: 'Your investment experience level' },
  goal_clarity:                { left: 'Vague',          right: 'Clearly defined',label: 'How clearly defined are your financial goals?' },
  time_horizon_flexibility:    { left: 'Rigid / fixed',  right: 'Very flexible',  label: 'Can you extend your investment horizon if markets are down?' },
  portfolio_gain_reaction:     { left: 'Lock in gains',  right: 'Stay invested',  label: 'After a 30% portfolio gain, your first instinct would be to...' },
  financial_literacy:          { left: 'Basic only',     right: 'Expert-level',   label: 'How would you rate your investment knowledge?' },
  income_stability_confidence: { left: 'Very uncertain', right: 'Very confident', label: 'How confident are you in your income stability over the next 5 years?' },
}

const SLIDER_SCALE_MIN = 1
const SLIDER_SCALE_MAX = 5
const SLIDER_DEFAULT = 3

// Coerce a stored value onto the 1-5 scale.
// Legacy profiles used 0-10 sliders; map those to the new range.
function coerceToScale(v) {
  const n = Number(v)
  if (!isFinite(n)) return SLIDER_DEFAULT
  // Legacy 0-10 values: map via round(n/2) clamped to 1-5
  const mapped = n > SLIDER_SCALE_MAX ? Math.round(n / 2) : Math.round(n)
  return Math.max(SLIDER_SCALE_MIN, Math.min(SLIDER_SCALE_MAX, mapped))
}

function mergeQuestionnaire(stored, defaults) {
  const out = { ...defaults }
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(defaults)) {
      if (stored[key] !== undefined && stored[key] !== null && stored[key] !== '') {
        out[key] = coerceToScale(stored[key])
      }
    }
  }
  return out
}

export default function ClientProfile() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [client, setClient] = useState(null)
  const [profileComplete, setProfileComplete] = useState(false)
  const [riskScores, setRiskScores] = useState(null)

  const [form, setForm] = useState({
    monthly_income: '',
    monthly_expenses: '',
    monthly_emi: '',
    income_type: 'Salaried',
    tax_slab: '30%',
    age: '',
    dependents: 0,
    has_home_loan: false,
    has_emergency_fund: false,
    emergency_fund_months: '',
    questionnaire_responses: Object.fromEntries(
      Object.keys(SLIDER_LABELS).map(k => [k, SLIDER_DEFAULT])
    ),
    primary_goal: '',
    investment_horizon: 10,
    elss_invested_this_year: '',
    existing_pf_balance: '',
  })

  useEffect(() => {
    async function load() {
      try {
        const [clientData, profileData] = await Promise.all([
          api.getClient(clientId),
          api.getClientProfile(clientId),
        ])
        setClient(clientData)
        if (profileData.profile) {
          const p = profileData.profile
          setProfileComplete(!!p.profile_complete)
          setRiskScores({
            capacity: p.risk_capacity_score,
            tolerance: p.risk_tolerance_score,
            effective: p.risk_effective_score,
            label: p.risk_label,
          })
          setForm(prev => ({
            ...prev,
            monthly_income: p.monthly_income || '',
            monthly_expenses: p.monthly_expenses || '',
            monthly_emi: p.monthly_emi || '',
            income_type: p.income_type || 'Salaried',
            tax_slab: p.tax_slab || '30%',
            age: p.age || '',
            dependents: p.dependents || 0,
            has_home_loan: !!p.has_home_loan,
            has_emergency_fund: !!p.has_emergency_fund,
            emergency_fund_months: p.emergency_fund_months || '',
            questionnaire_responses: mergeQuestionnaire(p.questionnaire_responses, prev.questionnaire_responses),
            primary_goal: p.primary_goal || '',
            investment_horizon: Number(p.investment_horizon) || 10,
            elss_invested_this_year: p.elss_invested_this_year || '',
            existing_pf_balance: p.existing_pf_balance || '',
          }))
        }
      } catch (err) {
        showToast(err.message, 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clientId])

  const investableSurplus = useMemo(() => {
    return Math.max(0, (Number(form.monthly_income) || 0) - (Number(form.monthly_expenses) || 0) - (Number(form.monthly_emi) || 0))
  }, [form.monthly_income, form.monthly_expenses, form.monthly_emi])

  const elssHeadroom = useMemo(() => {
    return Math.max(0, 150000 - (Number(form.elss_invested_this_year) || 0))
  }, [form.elss_invested_this_year])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const setQ = (field, value) => setForm(prev => ({
    ...prev,
    questionnaire_responses: { ...prev.questionnaire_responses, [field]: value },
  }))

  const saveStep = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        monthly_income: Number(form.monthly_income) || 0,
        monthly_expenses: Number(form.monthly_expenses) || 0,
        monthly_emi: Number(form.monthly_emi) || 0,
        age: Number(form.age) || 0,
        investment_horizon: Number(form.investment_horizon) || 0,
        elss_invested_this_year: Number(form.elss_invested_this_year) || 0,
        existing_pf_balance: Number(form.existing_pf_balance) || 0,
        emergency_fund_months: Number(form.emergency_fund_months) || 0,
      }
      const result = await api.saveClientProfile(clientId, payload)
      if (result.profile) {
        const p = result.profile
        if (p.profile_complete) setProfileComplete(true)
        setRiskScores({
          capacity: p.risk_capacity_score,
          tolerance: p.risk_tolerance_score,
          effective: p.risk_effective_score,
          label: p.risk_label,
        })
      }

      if (step < STEPS.length - 1) {
        setStep(step + 1)
        showToast('Saved', 'success')
      } else {
        showToast('Profile complete!', 'success')
        navigate(`/scoring/${clientId}`)
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-amber-400" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Client Profile</h1>
          <p className="text-slate-500 text-sm">{client?.name || 'Client'}</p>
        </div>
        {profileComplete && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-sm font-medium">
            <BadgeCheck size={16} /> Profile Complete
          </span>
        )}
      </div>

      {/* Risk Score Breakdown */}
      {riskScores && riskScores.capacity != null && (
        <div className="bg-surface-800 rounded-xl border border-white/[0.07] shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Risk Assessment</h3>
          <div className="space-y-3">
            <ScoreRow label="Financial Capacity" value={riskScores.capacity} />
            {riskScores.tolerance != null ? (
              <ScoreRow label="Behavioral Tolerance" value={riskScores.tolerance} />
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Behavioral Tolerance</span>
                <span className="text-sm text-amber-400 italic">Questionnaire pending</span>
              </div>
            )}
            {riskScores.effective != null && (
              <div className="pt-2 border-t border-white/[0.07]">
                <ScoreRow label="Effective Risk Score" value={riskScores.effective} highlight />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-500">Risk Label</span>
                  <span className="text-sm font-semibold text-amber-400">{riskScores.label}</span>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-3">
            Per NISM guidelines, the lower of Capacity and Tolerance is used for fund recommendations.
          </p>
          {riskScores.tolerance == null && (
            <p className="text-xs text-amber-500 mt-2">
              Complete the risk questionnaire to unlock fund recommendations.
            </p>
          )}
        </div>
      )}

      {/* Step Progress */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const isActive = i === step
          const isDone = i < step
          return (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'bg-amber-500 text-ink-900' : isDone ? 'bg-amber-500/10 text-amber-400' : 'bg-white/[0.04] text-slate-600'
              }`}
            >
              {isDone ? <Check size={16} className="text-amber-400" /> : <Icon size={16} />}
              <span className="hidden md:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="bg-surface-800 rounded-xl border border-white/[0.07] shadow-sm p-6">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Income & Cashflow</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberField label="Monthly Income (₹)" value={form.monthly_income} onChange={v => set('monthly_income', v)} />
              <NumberField label="Monthly Expenses (₹)" value={form.monthly_expenses} onChange={v => set('monthly_expenses', v)} />
              <NumberField label="Monthly EMIs (₹)" value={form.monthly_emi} onChange={v => set('monthly_emi', v)} />
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Income Type</label>
                <select value={form.income_type} onChange={e => set('income_type', e.target.value)}
                  className="w-full border border-white/[0.08] bg-surface-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                  {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Tax Slab</label>
              <div className="flex flex-wrap gap-2">
                {TAX_SLABS.map(s => (
                  <button key={s} onClick={() => set('tax_slab', s)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                      form.tax_slab === s ? 'bg-amber-500 text-ink-900 border-amber-500' : 'border-white/[0.08] text-slate-400 hover:border-amber-500/50'
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            {/* Surplus Preview */}
            <div className="bg-gradient-to-r from-ink-800 to-ink-600 rounded-lg p-4 text-white">
              <p className="text-sm text-slate-400 mb-1">Investable Surplus</p>
              <p className="text-2xl font-bold text-amber-400">{formatCurrency(investableSurplus)}</p>
              <p className="text-xs text-slate-500 mt-1">Income - Expenses - EMIs</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Life Situation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberField label="Age" value={form.age} onChange={v => set('age', v)} />
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Dependents</label>
                <select value={form.dependents} onChange={e => set('dependents', Number(e.target.value))}
                  className="w-full border border-white/[0.08] bg-surface-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                  {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <Toggle label="Has Home Loan?" value={form.has_home_loan} onChange={v => set('has_home_loan', v)} />
            <Toggle label="Has Emergency Fund?" value={form.has_emergency_fund} onChange={v => set('has_emergency_fund', v)} />
            {form.has_emergency_fund && (
              <NumberField label="Emergency Fund (months of expenses)" value={form.emergency_fund_months} onChange={v => set('emergency_fund_months', v)} />
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">Investment Behavior</h2>
            <p className="text-xs text-slate-500 mb-4">Rate each statement on a 1 (low) to 5 (high) scale. All 8 answers are required to unlock fund recommendations.</p>
            {Object.entries(SLIDER_LABELS).map(([key, cfg]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-300 mb-2">{cfg.label}</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 text-right shrink-0">{cfg.left}</span>
                  <input type="range" min={SLIDER_SCALE_MIN} max={SLIDER_SCALE_MAX} step={1}
                    value={form.questionnaire_responses[key] ?? SLIDER_DEFAULT}
                    onChange={e => setQ(key, Number(e.target.value))}
                    className="flex-1 accent-amber-500" />
                  <span className="text-xs text-slate-500 w-24 shrink-0">{cfg.right}</span>
                  <span className="text-sm font-bold text-slate-100 w-8 text-center tabular-nums">{form.questionnaire_responses[key] ?? SLIDER_DEFAULT}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Goals & Horizon</h2>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Primary Goal</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button key={g} onClick={() => set('primary_goal', g)}
                    className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all text-center ${
                      form.primary_goal === g ? 'bg-amber-500 text-ink-900 border-amber-500' : 'border-white/[0.08] text-slate-400 hover:border-amber-500/50'
                    }`}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Investment Horizon: <span className="text-amber-400 font-bold">{form.investment_horizon} years</span>
              </label>
              <input type="range" min={1} max={30} value={form.investment_horizon}
                onChange={e => set('investment_horizon', Number(e.target.value))}
                className="w-full accent-amber-500" />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>1 year</span><span>15 years</span><span>30 years</span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Existing Assets</h2>
            <div>
              <NumberField label="ELSS Invested This Year (₹)" value={form.elss_invested_this_year} onChange={v => set('elss_invested_this_year', v)} />
              <p className="text-xs text-slate-500 mt-1">80C headroom remaining: <span className="font-semibold text-amber-400">{formatCurrency(elssHeadroom)}</span> of ₹1,50,000</p>
            </div>
            <div>
              <NumberField label="Existing PF Balance (₹)" value={form.existing_pf_balance} onChange={v => set('existing_pf_balance', v)} />
              <p className="text-xs text-slate-500 mt-1">PF balance counts towards your debt allocation in the recommended portfolio</p>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-3 text-sm text-sky-400">
              For detailed holdings import via CAS statement, use the CAS Import feature in Portfolio X-Ray.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t border-white/[0.07]">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> Back
          </button>
          <button onClick={saveStep} disabled={saving}
            className="flex items-center gap-1 px-6 py-2.5 bg-amber-500 text-ink-900 rounded-lg text-sm font-semibold hover:bg-amber-400 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {step === STEPS.length - 1 ? 'Save & View Recommendations' : 'Save & Next'}
            {!saving && step < STEPS.length - 1 && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-white/[0.08] bg-surface-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
        min={0} />
    </div>
  )
}

function ScoreRow({ label, value, highlight }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm w-44 shrink-0 ${highlight ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>{label}</span>
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm w-14 text-right font-mono ${highlight ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>{Math.round(value)}/100</span>
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-amber-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  )
}
