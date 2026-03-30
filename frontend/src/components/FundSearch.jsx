import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import useFundSearch from '../hooks/useFundSearch'

export default function FundSearch({ onSelect, placeholder = 'Search mutual funds...', className = '' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { results, loading } = useFundSearch(query)
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2.5 bg-surface-700 border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
            <X size={14} />
          </button>
        )}
      </div>
      {open && (query.length >= 2) && (
        <div className="absolute z-50 w-full mt-1 bg-surface-700 border border-white/[0.10] rounded-lg shadow-2xl shadow-black/40 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-slate-500">
              <Loader2 size={18} className="animate-spin mr-2" /> Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-500">No funds found</div>
          ) : (
            results.map((fund) => (
              <button
                key={fund.scheme_code}
                onClick={() => { onSelect(fund); setQuery(''); setOpen(false) }}
                className="w-full text-left px-4 py-3 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-0 transition-colors"
              >
                <p className="text-sm font-medium text-slate-200 truncate">{fund.scheme_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{fund.scheme_category} · {fund.amc}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
