import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  PieChart,
  FileText,
  Target,
  Calculator,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Fund Intelligence', icon: TrendingUp, to: '/fund-intelligence' },
  { label: 'Portfolio X-Ray', icon: PieChart, to: '/portfolio-xray' },
  { label: 'Report Generator', icon: FileText, to: '/report-generator' },
  { label: 'Goal Planner', icon: Target, to: '/goal-planner' },
  { label: 'Tax Optimizer', icon: Calculator, to: '/tax-optimizer' },
  { label: 'Client CRM', icon: Users, to: '/crm' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className="flex flex-col h-screen bg-[#1B2A4A] text-white transition-all duration-300 shrink-0"
      style={{ width: collapsed ? 72 : 260 }}
    >
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-[#D4A847] flex items-center justify-center font-bold text-[#1B2A4A] text-lg shrink-0">
          T
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-wide text-[#D4A847]">TEJOVA</h1>
            <p className="text-[11px] text-gray-400 leading-tight">MFD Ops Toolkit</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#D4A847]/15 text-[#D4A847]'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center py-3 border-t border-white/10 text-gray-400 hover:text-white transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  )
}
