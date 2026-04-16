import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Modal — portal-rendered dialog with backdrop, Esc-to-close and body scroll lock.
// Props:
//   open         — boolean, controls visibility
//   onClose      — callback invoked on backdrop click / Esc / close button
//   title        — optional string for the header
//   size         — 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
//   children     — body content
//   footer       — optional footer node rendered below children
//   closeOnBackdrop — default true
export function Modal({ open, onClose, title, size = 'md', children, footer, closeOnBackdrop = true }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (closeOnBackdrop) onClose?.() }}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
    >
      <div
        className={`w-full ${sizes[size] || sizes.md} bg-surface-800 border border-white/[0.08] rounded-2xl shadow-2xl max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-lg font-bold text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-white/[0.06]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// Card — standard dark surface card
export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-surface-800 border border-white/[0.07] rounded-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// Card with glass tint for hero cards
export function GlassCard({ children, className = '', ...props }) {
  return (
    <div
      className={`bg-white/[0.03] border border-white/[0.08] rounded-xl backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// Stat — metric display block
export function Stat({ label, value, sub, trend, icon: Icon, accent = false, className = '' }) {
  const trendPositive = trend > 0
  return (
    <div className={`p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">{label}</p>
          <p className={`text-2xl font-bold data-num leading-none truncate ${accent ? 'text-amber-400 glow-gold' : 'text-slate-100'}`}>{value}</p>
          {sub && <p className="text-[11px] text-slate-600 mt-1.5">{sub}</p>}
          {trend != null && (
            <p className={`text-xs font-medium mt-1.5 ${trendPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {trendPositive ? '\u25B2' : '\u25BC'} {Math.abs(trend)}%
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0 ml-3">
            <Icon size={16} className="text-slate-500" />
          </div>
        )}
      </div>
    </div>
  )
}

// Badge — category/status pill
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-white/[0.06] text-slate-400 border-white/[0.08]',
    gold:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    green:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red:     'bg-red-500/10 text-red-400 border-red-500/20',
    blue:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
    violet:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

// Button variants
export function Button({ children, variant = 'primary', size = 'md', disabled, loading, onClick, className = '', ...props }) {
  const variants = {
    primary:   'bg-amber-500 hover:bg-amber-400 text-ink-900 font-semibold shadow-lg shadow-amber-500/20',
    secondary: 'bg-white/[0.06] hover:bg-white/[0.10] text-slate-300 border border-white/[0.08]',
    ghost:     'hover:bg-white/[0.05] text-slate-400 hover:text-slate-200',
    danger:    'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-sm rounded-xl',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
        </svg>
      )}
      {children}
    </button>
  )
}

// Section header
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// Table components
export function Table({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}
export function Th({ children, right }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-600 bg-white/[0.02] border-b border-white/[0.06] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}
export function Td({ children, right, className = '' }) {
  return (
    <td className={`px-4 py-3.5 border-b border-white/[0.04] text-slate-300 ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  )
}

// Input
export function Input({ label, hint, ...props }) {
  return (
    <div>
      {label && <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 block mb-2">{label}</label>}
      <input
        className="w-full px-3 py-2.5 bg-surface-700 border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
        {...props}
      />
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

// Select
export function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 block mb-2">{label}</label>}
      <select
        className="w-full px-3 py-2.5 bg-surface-700 border border-white/[0.08] rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 appearance-none"
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// Empty state
export function Empty({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
          <Icon size={20} className="text-slate-600" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-400">{title}</p>
      {subtitle && <p className="text-xs text-slate-600 mt-1">{subtitle}</p>}
    </div>
  )
}

// Loading spinner
export function Spinner({ size = 20, className = '' }) {
  return (
    <svg className={`animate-spin ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
    </svg>
  )
}

// Number with colour based on sign
export function DataValue({ value, prefix = '', suffix = '', decimals = 2, className = '' }) {
  if (value == null) return <span className="text-slate-600">{'\u2014'}</span>
  const positive = value >= 0
  return (
    <span className={`data-num font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'} ${className}`}>
      {positive ? '+' : ''}{prefix}
      {typeof value === 'number' ? value.toFixed(decimals) : value}
      {suffix}
    </span>
  )
}
