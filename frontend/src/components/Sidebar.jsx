import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, PieChart, FileText,
  Target, Calculator, Users, Brain, Wallet,
  ChevronLeft, ChevronRight, Menu, X, LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { label: 'Dashboard',        icon: LayoutDashboard, to: '/'                  },
  { label: 'Fund Recommender', icon: Brain,            to: '/scoring'           },
  { label: 'Fund Intelligence',icon: TrendingUp,       to: '/fund-intelligence' },
  { label: 'Portfolio X-Ray',  icon: PieChart,         to: '/portfolio-xray'    },
  { label: 'Wealth Overview',  icon: Wallet,           to: '/wealth'            },
  { label: 'Report Generator', icon: FileText,         to: '/report-generator'  },
  { label: 'Goal Planner',     icon: Target,           to: '/goal-planner'      },
  { label: 'Tax Optimizer',    icon: Calculator,       to: '/tax-optimizer'     },
  { label: 'Client CRM',       icon: Users,            to: '/crm'               },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { logout } = useAuth()

  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/20">
          <span className="text-sm font-black text-ink-900">T</span>
        </div>
        {(!collapsed || isMobile) && (
          <div>
            <h1 className="text-sm font-bold tracking-widest text-amber-400 uppercase">TEJOVA</h1>
            <p className="text-[10px] text-slate-500 leading-none mt-0.5">Intelligence Platform</p>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto p-1 text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => isMobile && setMobileOpen(false)}
            className={({ isActive }) => [
              'flex items-center gap-3 px-3 py-2.5 rounded-lg',
              'text-[13px] font-medium transition-all duration-150',
              'group relative',
              isActive
                ? 'bg-amber-500/10 text-amber-400'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]',
            ].join(' ')}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-400 rounded-r-full" />
                )}
                <Icon
                  size={16}
                  className={`shrink-0 transition-colors ${isActive ? 'text-amber-400' : 'text-slate-600 group-hover:text-slate-300'}`}
                />
                {(!collapsed || isMobile) && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-4 border-t border-white/[0.06] pt-3 space-y-0.5">
        {(!collapsed || isMobile) && (
          <div className="px-3 py-2 mb-2">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">v2.0 — Intelligence Engine</p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-600 hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut size={16} className="shrink-0" />
          {(!collapsed || isMobile) && <span>Sign Out</span>}
        </button>
        {!isMobile && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-center py-2 text-slate-600 hover:text-slate-400 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-surface-800 border border-white/10 text-slate-400 rounded-lg shadow-xl"
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-ink-900 border-r border-white/[0.06] transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarContent isMobile />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col h-screen shrink-0 bg-ink-900 border-r border-white/[0.06] transition-all duration-200"
        style={{ width: collapsed ? 64 : 240 }}
      >
        <SidebarContent />
      </aside>
    </>
  )
}
