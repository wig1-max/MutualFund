import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import FundIntelligence from './pages/FundIntelligence'
import ClientCRM from './pages/ClientCRM'

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#f8f9fc]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fund-intelligence" element={<FundIntelligence />} />
            <Route path="/portfolio-xray" element={<div className="p-8"><h1 className="text-2xl font-bold text-[#1B2A4A]">Portfolio X-Ray</h1><p className="text-gray-500 mt-2">Coming soon...</p></div>} />
            <Route path="/report-generator" element={<div className="p-8"><h1 className="text-2xl font-bold text-[#1B2A4A]">Report Generator</h1><p className="text-gray-500 mt-2">Coming soon...</p></div>} />
            <Route path="/goal-planner" element={<div className="p-8"><h1 className="text-2xl font-bold text-[#1B2A4A]">Goal Planner</h1><p className="text-gray-500 mt-2">Coming soon...</p></div>} />
            <Route path="/tax-optimizer" element={<div className="p-8"><h1 className="text-2xl font-bold text-[#1B2A4A]">Tax Optimizer</h1><p className="text-gray-500 mt-2">Coming soon...</p></div>} />
            <Route path="/crm" element={<ClientCRM />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
