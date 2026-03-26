import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { ClientProvider } from './contexts/ClientContext'
import Dashboard from './pages/Dashboard'
import FundIntelligence from './pages/FundIntelligence'
import ClientCRM from './pages/ClientCRM'
import PortfolioXray from './pages/PortfolioXray'
import GoalPlanner from './pages/GoalPlanner'
import TaxOptimizer from './pages/TaxOptimizer'

export default function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#f8f9fc]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <ClientProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fund-intelligence" element={<FundIntelligence />} />
            <Route path="/portfolio-xray" element={<PortfolioXray />} />
            <Route path="/report-generator" element={<div className="p-8"><h1 className="text-2xl font-bold text-[#1B2A4A]">Report Generator</h1><p className="text-gray-500 mt-2">Coming soon...</p></div>} />
            <Route path="/goal-planner" element={<GoalPlanner />} />
            <Route path="/tax-optimizer" element={<TaxOptimizer />} />
            <Route path="/crm" element={<ClientCRM />} />
          </Routes>
          </ClientProvider>
        </main>
      </div>
    </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  )
}
