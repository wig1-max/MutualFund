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
  Brain,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Fund Recommender', icon: Brain, to: '/scoring' },
  { label: 'Fund Intelligence', icon: TrendingUp, to: '/fund-intelligence' },
  { label: 'Portfolio X-Ray', icon: PieChart, to: '/portfolio-xray' },
  { label: 'Report Generator', icon: FileText, to: '/report-generator' },
  { label: 'Goal Planner', icon: Target, to: '/goal-planner' },
  { label: 'Tax Optimizer', icon: Calculator, to: '/tax-optimizer' },
  { label: 'Client CRM', icon: Users, to: '/crm' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarContent = (
    <>
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-[#D4A847] flex items-center justify-center font-bold text-[#1B2A4A] text-lg shrink-0">
          T
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-wide text-[#D4A847]">TEJOVA</h1>
            <p className="text-[11px] text-gray-400 leading-tight">Intelligence Platform</p>
          </div>
        )}
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden ml-auto p-1 text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setMobileOpen(false)}
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
            {(!collapsed || mobileOpen) && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="hidden lg:flex items-center justify-center py-3 border-t border-white/10 text-gray-400 hover:text-white transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-[#1B2A4A] text-white rounded-lg shadow-lg"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[260px] text-white transform transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'linear-gradient(180deg, #1B2A4A 0%, #0d1a30 100%)' }}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col h-screen text-white transition-all duration-300 shrink-0"
        style={{ background: 'linear-gradient(180deg, #1B2A4A 0%, #0d1a30 100%)' }}
        style={{ width: collapsed ? 72 : 260 }}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
