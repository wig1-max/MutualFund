import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Search, X, Edit3, Trash2, MessageSquare, CheckCircle,
  Phone, Mail, Shield, Calendar, Clock, ChevronRight, ChevronLeft,
  Filter, Loader2, UserPlus, AlertCircle
} from 'lucide-react'
import * as api from '../services/api'
import { formatDate } from '../lib/utils'

const TAGS = ['HNI', 'Salaried', 'Business Owner', 'NRI', 'Senior Citizen', 'New Investor']
const RISK_PROFILES = ['Conservative', 'Moderate', 'Aggressive']
const REVIEW_FREQUENCIES = ['Monthly', 'Quarterly', 'Half-yearly', 'Annual']

const TAG_COLORS = {
  HNI: 'bg-amber-50 text-amber-700',
  Salaried: 'bg-blue-50 text-blue-700',
  'Business Owner': 'bg-purple-50 text-purple-700',
  NRI: 'bg-emerald-50 text-emerald-700',
  'Senior Citizen': 'bg-orange-50 text-orange-700',
  'New Investor': 'bg-cyan-50 text-cyan-700',
}

const RISK_COLORS = {
  Conservative: 'bg-green-50 text-green-700',
  Moderate: 'bg-yellow-50 text-yellow-700',
  Aggressive: 'bg-red-50 text-red-700',
}

export default function ClientCRM() {
  const [clients, setClients] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterRisk, setFilterRisk] = useState('')
  const [filterReviewDue, setFilterReviewDue] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)

  const loadClients = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterTag) params.tag = filterTag
      if (filterRisk) params.risk_profile = filterRisk
      if (filterReviewDue) params.review_due = 'true'
      const data = await api.getClients(params)
      setClients(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, filterTag, filterRisk, filterReviewDue])

  const loadStats = async () => {
    try {
      const data = await api.getClientStats()
      setStats(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadClients()
    loadStats()
  }, [loadClients])

  // Debounced search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleDelete = async (id) => {
    try {
      await api.deleteClient(id)
      if (selectedClient?.id === id) setSelectedClient(null)
      loadClients()
      loadStats()
    } catch (err) {
      console.error(err)
    }
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingClient(null)
  }

  const handleFormSave = () => {
    handleFormClose()
    loadClients()
    loadStats()
  }

  const handleSelectClient = async (client) => {
    try {
      const full = await api.getClient(client.id)
      setSelectedClient(full)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A] flex items-center gap-2">
            <Users className="text-[#D4A847]" /> Client CRM
          </h1>
          <p className="text-gray-500 mt-1">Manage clients, track reviews, and maintain relationships</p>
        </div>
        <button
          onClick={() => { setEditingClient(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] transition-colors"
        >
          <UserPlus size={16} /> Add Client
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Clients" value={stats.totalClients} icon={Users} color="bg-blue-50 text-blue-600" />
          <StatCard label="Reviews Due (7d)" value={stats.reviewsDueThisWeek} icon={Clock} color="bg-amber-50 text-amber-600" />
          <StatCard
            label="Risk Split"
            value={stats.byRiskProfile?.map(r => `${r.count} ${r.risk_profile?.charAt(0)}`).join(' / ') || '—'}
            icon={Shield}
            color="bg-purple-50 text-purple-600"
            small
          />
          <StatCard
            label="Top Tags"
            value={Object.entries(stats.tagCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t}: ${c}`).join(', ') || '—'}
            icon={Filter}
            color="bg-emerald-50 text-emerald-600"
            small
          />
        </div>
      )}

      <div className="flex gap-6">
        {/* Client List */}
        <div className={`${selectedClient ? 'w-1/2' : 'w-full'} transition-all`}>
          {/* Search & Filters */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name, phone, or email..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847]"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
                  showFilters || filterTag || filterRisk || filterReviewDue
                    ? 'border-[#D4A847] bg-[#D4A847]/5 text-[#D4A847]'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Filter size={14} /> Filters
              </button>
            </div>
            {showFilters && (
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40"
                >
                  <option value="">All Tags</option>
                  {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={filterRisk}
                  onChange={(e) => setFilterRisk(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40"
                >
                  <option value="">All Risk Profiles</option>
                  {RISK_PROFILES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterReviewDue}
                    onChange={(e) => setFilterReviewDue(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Review due this week
                </label>
                {(filterTag || filterRisk || filterReviewDue) && (
                  <button
                    onClick={() => { setFilterTag(''); setFilterRisk(''); setFilterReviewDue(false) }}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Client List */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-20">
              <Users size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm">
                {search || filterTag || filterRisk ? 'No clients match your filters' : 'No clients yet. Add your first client!'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map((client) => {
                const isSelected = selectedClient?.id === client.id
                const reviewDue = client.next_review_date && client.next_review_date <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                return (
                  <div
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? 'border-[#D4A847] ring-1 ring-[#D4A847]/20' : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-[#1B2A4A] truncate">{client.name}</h3>
                          {reviewDue && (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full font-medium">
                              <AlertCircle size={10} /> Review due
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {client.phone && <span className="flex items-center gap-1"><Phone size={10} /> {client.phone}</span>}
                          {client.email && <span className="flex items-center gap-1"><Mail size={10} /> {client.email}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[client.risk_profile] || 'bg-gray-100 text-gray-600'}`}>
                            {client.risk_profile}
                          </span>
                          {client.tags?.map(tag => (
                            <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600'}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Client Detail Panel */}
        {selectedClient && (
          <ClientDetailPanel
            client={selectedClient}
            onClose={() => setSelectedClient(null)}
            onEdit={() => { setEditingClient(selectedClient); setShowForm(true) }}
            onDelete={() => handleDelete(selectedClient.id)}
            onUpdate={async () => {
              const full = await api.getClient(selectedClient.id)
              setSelectedClient(full)
              loadClients()
              loadStats()
            }}
          />
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <ClientFormModal
          client={editingClient}
          onClose={handleFormClose}
          onSave={handleFormSave}
        />
      )}
    </div>
  )
}

// ---------- Stat Card ----------
function StatCard({ label, value, icon: Icon, color, small }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
          <p className={`${small ? 'text-xs mt-2 text-gray-600' : 'text-2xl font-bold text-[#1B2A4A] mt-1'}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${color}`}><Icon size={18} /></div>
      </div>
    </div>
  )
}

// ---------- Client Detail Panel ----------
function ClientDetailPanel({ client, onClose, onEdit, onDelete, onUpdate }) {
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [completing, setCompleting] = useState(false)

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      await api.addClientNote(client.id, newNote)
      setNewNote('')
      onUpdate()
    } catch (err) {
      console.error(err)
    } finally {
      setAddingNote(false)
    }
  }

  const handleDeleteNote = async (noteId) => {
    try {
      await api.deleteClientNote(client.id, noteId)
      onUpdate()
    } catch (err) {
      console.error(err)
    }
  }

  const handleCompleteReview = async () => {
    setCompleting(true)
    try {
      await api.completeClientReview(client.id)
      onUpdate()
    } catch (err) {
      console.error(err)
    } finally {
      setCompleting(false)
    }
  }

  const reviewDue = client.next_review_date && client.next_review_date <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return (
    <div className="w-1/2 bg-white border border-gray-100 rounded-xl shadow-sm overflow-y-auto" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 p-5 z-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1B2A4A]">{client.name}</h2>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-[#D4A847] transition-colors" title="Edit">
              <Edit3 size={16} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-3">
          <InfoField label="Phone" value={client.phone} icon={Phone} />
          <InfoField label="Email" value={client.email} icon={Mail} />
          <InfoField label="PAN" value={client.pan_masked} icon={Shield} />
          <InfoField label="Risk Profile" value={client.risk_profile} badge={RISK_COLORS[client.risk_profile]} />
          <InfoField label="Onboarding Date" value={client.onboarding_date ? formatDate(client.onboarding_date) : '—'} icon={Calendar} />
          <InfoField label="Referred By" value={client.referred_by || '—'} />
        </div>

        {/* Tags */}
        {client.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {client.tags.map(tag => (
              <span key={tag} className={`text-xs px-2.5 py-1 rounded-full font-medium ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600'}`}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Review Schedule */}
        <div className={`rounded-lg p-4 ${reviewDue ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase">Next Review</p>
              <p className={`text-sm font-semibold mt-0.5 ${reviewDue ? 'text-amber-700' : 'text-[#1B2A4A]'}`}>
                {client.next_review_date ? formatDate(client.next_review_date) : 'Not scheduled'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Frequency: {client.review_frequency}</p>
            </div>
            <button
              onClick={handleCompleteReview}
              disabled={completing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              <CheckCircle size={14} /> {completing ? 'Completing...' : 'Mark Complete'}
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 flex items-center gap-2">
            <MessageSquare size={14} /> Notes ({client.notes?.length || 0})
          </h3>

          {/* Add Note */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40"
            />
            <button
              onClick={handleAddNote}
              disabled={addingNote || !newNote.trim()}
              className="px-3 py-2 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#1B2A4A]/90 disabled:opacity-50 transition-colors"
            >
              {addingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>

          {/* Notes List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {client.notes?.length === 0 && (
              <p className="text-xs text-gray-300 text-center py-4">No notes yet</p>
            )}
            {client.notes?.map((note) => (
              <div key={note.id} className="flex items-start justify-between gap-2 p-3 bg-gray-50 rounded-lg group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{note.note}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(note.created_at)}</p>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoField({ label, value, icon: Icon, badge }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 font-medium uppercase">{label}</p>
      {badge ? (
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${badge}`}>{value}</span>
      ) : (
        <p className="text-sm text-[#1B2A4A] mt-0.5 flex items-center gap-1.5">
          {Icon && <Icon size={12} className="text-gray-300" />}
          {value || '—'}
        </p>
      )}
    </div>
  )
}

// ---------- Client Form Modal ----------
function ClientFormModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    name: client?.name || '',
    phone: client?.phone || '',
    email: client?.email || '',
    pan: '',
    risk_profile: client?.risk_profile || 'Moderate',
    onboarding_date: client?.onboarding_date || new Date().toISOString().split('T')[0],
    referred_by: client?.referred_by || '',
    tags: client?.tags || [],
    review_frequency: client?.review_frequency || 'Quarterly',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const toggleTag = (tag) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (client) {
        await api.updateClient(client.id, form)
      } else {
        await api.createClient(form)
      }
      onSave()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-[#1B2A4A]">{client ? 'Edit Client' : 'Add New Client'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          <FormField label="Name *" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} required />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Phone" value={form.phone} onChange={(v) => setForm(f => ({ ...f, phone: v }))} type="tel" />
            <FormField label="Email" value={form.email} onChange={(v) => setForm(f => ({ ...f, email: v }))} type="email" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="PAN (will be masked)" value={form.pan} onChange={(v) => setForm(f => ({ ...f, pan: v }))} placeholder={client?.pan_masked || 'e.g. ABCDE1234F'} maxLength={10} />
            <FormField label="Referred By" value={form.referred_by} onChange={(v) => setForm(f => ({ ...f, referred_by: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Risk Profile</label>
              <select
                value={form.risk_profile}
                onChange={(e) => setForm(f => ({ ...f, risk_profile: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40"
              >
                {RISK_PROFILES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Review Frequency</label>
              <select
                value={form.review_frequency}
                onChange={(e) => setForm(f => ({ ...f, review_frequency: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40"
              >
                {REVIEW_FREQUENCIES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <FormField label="Onboarding Date" value={form.onboarding_date} onChange={(v) => setForm(f => ({ ...f, onboarding_date: v }))} type="date" />

          {/* Tags */}
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-2">Tags</label>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                    form.tags.includes(tag)
                      ? TAG_COLORS[tag] + ' ring-1 ring-current'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-[#D4A847] text-white rounded-lg text-sm font-medium hover:bg-[#c49a2e] disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {client ? 'Update Client' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', placeholder, required, maxLength }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-medium block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847]"
      />
    </div>
  )
}
