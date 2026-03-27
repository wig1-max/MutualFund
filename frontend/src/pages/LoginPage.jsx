import { useState } from 'react'
import { Lock, Loader2 } from 'lucide-react'
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
    <div className="min-h-screen bg-[#1B2A4A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#D4A847]/10 mb-4">
            <span className="text-3xl font-bold text-[#D4A847]">T</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Tejova</h1>
          <p className="text-gray-400 text-sm mt-1">MFD Operations Toolkit</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={18} className="text-[#D4A847]" />
            <h2 className="text-lg font-semibold text-[#1B2A4A]">Sign In</h2>
          </div>

          <div className="mb-4">
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847]"
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs mb-4 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-[#D4A847] text-white rounded-xl text-sm font-semibold hover:bg-[#c49a2e] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-gray-500 text-[10px] mt-6">
          Tejova &middot; AMFI-registered Mutual Fund Distributor
        </p>
      </div>
    </div>
  )
}
