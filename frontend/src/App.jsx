import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { ClientProvider } from './contexts/ClientContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import FundIntelligence from './pages/FundIntelligence'
import ClientCRM from './pages/ClientCRM'
import PortfolioXray from './pages/PortfolioXray'
import GoalPlanner from './pages/GoalPlanner'
import TaxOptimizer from './pages/TaxOptimizer'
import ReportGenerator from './pages/ReportGenerator'
import { Loader2 } from 'lucide-react'

function AuthenticatedApp() {
  const { authenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1B2A4A] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#D4A847]" />
      </div>
    )
  }

  if (!authenticated) return <LoginPage />

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#f8f9fc]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <ClientProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fund-intelligence" element={<FundIntelligence />} />
            <Route path="/portfolio-xray" element={<PortfolioXray />} />
            <Route path="/report-generator" element={<ReportGenerator />} />
            <Route path="/goal-planner" element={<GoalPlanner />} />
            <Route path="/tax-optimizer" element={<TaxOptimizer />} />
            <Route path="/crm" element={<ClientCRM />} />
          </Routes>
          </ClientProvider>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
    </ToastProvider>
    </ErrorBoundary>
  )
}
