import { useState } from 'react'
import { Lock, Loader2, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(password)
    } catch (err) {
      setError(err.message)
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex">
      {/* Left panel — hidden on mobile */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-ink-800 to-ink-950 flex-col justify-center px-16 relative overflow-hidden">
        {/* Geometric pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative z-10">
          <h1 className="text-5xl font-bold text-amber-400 tracking-wider mb-3">TEJOVA</h1>
          <p className="text-xl text-slate-400 mb-10">India's first mutual fund intelligence engine</p>
          <div className="space-y-4">
            {['AI-powered fund recommendations', 'Real-time portfolio intelligence', 'SEBI-compliant reporting'].map(text => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Check size={12} className="text-amber-400" />
                </div>
                <span className="text-slate-300 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/20 mb-4">
              <span className="text-2xl font-black text-ink-900">T</span>
            </div>
            <h1 className="text-2xl font-bold text-amber-400 tracking-wider">TEJOVA</h1>
            <p className="text-slate-500 text-sm mt-1">Intelligence Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-surface-800 border border-white/[0.08] rounded-2xl p-10">
            <div className="flex items-center gap-2 mb-6">
              <Lock size={18} className="text-amber-400" />
              <h2 className="text-lg font-semibold text-slate-100">Sign In</h2>
            </div>

            <div className="mb-4">
              <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
                required
                className="w-full px-4 py-3 bg-surface-700 border border-white/[0.08] rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-amber-500 text-ink-900 rounded-xl text-sm font-semibold hover:bg-amber-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-slate-600 text-[10px] mt-6">
            Tejova &middot; AMFI-registered Mutual Fund Distributor
          </p>
        </div>
      </div>
    </div>
  )
}
