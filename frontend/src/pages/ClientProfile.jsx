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

const SLIDER_LABELS = {
  market_fall_reaction: { left: 'Panic sell', right: 'Buy more', label: 'If your portfolio drops 20% in a month, you would...' },
  loss_tolerance: { left: 'No tolerance', right: 'Very high', label: 'How much temporary loss can you stomach?' },
  investment_experience: { left: 'First time', right: '10+ years expert', label: 'Your investment experience level' },
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
    questionnaire_responses: { market_fall_reaction: 5, loss_tolerance: 5, investment_experience: 3 },
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
            questionnaire_responses: p.questionnaire_responses || prev.questionnaire_responses,
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
      if (result.profile?.profile_complete) setProfileComplete(true)

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
        <Loader2 className="animate-spin text-[#D4A847]" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A]">Client Profile</h1>
          <p className="text-gray-500 text-sm">{client?.name || 'Client'}</p>
        </div>
        {profileComplete && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium">
            <BadgeCheck size={16} /> Profile Complete
          </span>
        )}
      </div>

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
                isActive ? 'bg-[#1B2A4A] text-white' : isDone ? 'bg-[#D4A847]/10 text-[#1B2A4A]' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {isDone ? <Check size={16} className="text-[#D4A847]" /> : <Icon size={16} />}
              <span className="hidden md:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">Income & Cashflow</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberField label="Monthly Income (₹)" value={form.monthly_income} onChange={v => set('monthly_income', v)} />
              <NumberField label="Monthly Expenses (₹)" value={form.monthly_expenses} onChange={v => set('monthly_expenses', v)} />
              <NumberField label="Monthly EMIs (₹)" value={form.monthly_emi} onChange={v => set('monthly_emi', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Income Type</label>
                <select value={form.income_type} onChange={e => set('income_type', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/50">
                  {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tax Slab</label>
              <div className="flex flex-wrap gap-2">
                {TAX_SLABS.map(s => (
                  <button key={s} onClick={() => set('tax_slab', s)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                      form.tax_slab === s ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'border-gray-200 text-gray-600 hover:border-[#D4A847]'
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            {/* Surplus Preview */}
            <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2a3f6a] rounded-lg p-4 text-white">
              <p className="text-sm text-gray-300 mb-1">Investable Surplus</p>
              <p className="text-2xl font-bold text-[#D4A847]">{formatCurrency(investableSurplus)}</p>
              <p className="text-xs text-gray-400 mt-1">Income - Expenses - EMIs</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">Life Situation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberField label="Age" value={form.age} onChange={v => set('age', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dependents</label>
                <select value={form.dependents} onChange={e => set('dependents', Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/50">
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
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">Investment Behavior</h2>
            {Object.entries(SLIDER_LABELS).map(([key, cfg]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{cfg.label}</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-20 text-right">{cfg.left}</span>
                  <input type="range" min={0} max={10} value={form.questionnaire_responses[key]}
                    onChange={e => setQ(key, Number(e.target.value))}
                    className="flex-1 accent-[#D4A847]" />
                  <span className="text-xs text-gray-400 w-20">{cfg.right}</span>
                  <span className="text-sm font-bold text-[#1B2A4A] w-8 text-center">{form.questionnaire_responses[key]}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">Goals & Horizon</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Primary Goal</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {GOAL_OPTIONS.map(g => (
                  <button key={g} onClick={() => set('primary_goal', g)}
                    className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all text-center ${
                      form.primary_goal === g ? 'bg-[#D4A847] text-white border-[#D4A847]' : 'border-gray-200 text-gray-600 hover:border-[#D4A847]'
                    }`}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Investment Horizon: <span className="text-[#D4A847] font-bold">{form.investment_horizon} years</span>
              </label>
              <input type="range" min={1} max={30} value={form.investment_horizon}
                onChange={e => set('investment_horizon', Number(e.target.value))}
                className="w-full accent-[#D4A847]" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1 year</span><span>15 years</span><span>30 years</span>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[#1B2A4A] mb-4">Existing Assets</h2>
            <div>
              <NumberField label="ELSS Invested This Year (₹)" value={form.elss_invested_this_year} onChange={v => set('elss_invested_this_year', v)} />
              <p className="text-xs text-gray-500 mt-1">80C headroom remaining: <span className="font-semibold text-[#D4A847]">{formatCurrency(elssHeadroom)}</span> of ₹1,50,000</p>
            </div>
            <div>
              <NumberField label="Existing PF Balance (₹)" value={form.existing_pf_balance} onChange={v => set('existing_pf_balance', v)} />
              <p className="text-xs text-gray-500 mt-1">PF balance counts towards your debt allocation in the recommended portfolio</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              For detailed holdings import via CAS statement, use the CAS Import feature in Portfolio X-Ray.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-500 hover:text-[#1B2A4A] disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> Back
          </button>
          <button onClick={saveStep} disabled={saving}
            className="flex items-center gap-1 px-6 py-2.5 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#2a3f6a] disabled:opacity-50">
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/50"
        min={0} />
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-[#D4A847]' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  )
}
