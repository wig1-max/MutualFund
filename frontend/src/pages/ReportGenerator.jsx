import React, { useState, useRef } from 'react'
import { useClientContext } from '../contexts/ClientContext'
import { useToast } from '../components/Toast'
import { generateReport } from '../services/api'
import {
  FileText, PieChart, Target, Calculator, ClipboardList,
  Loader2, Printer, Download, Sparkles, ChevronDown, ChevronUp,
  User, Calendar, AlertTriangle,
} from 'lucide-react'

const REPORT_TYPES = [
  {
    id: 'portfolio_review',
    label: 'Portfolio Review',
    description: 'Portfolio health check with allocation, performance, and recommendations',
    icon: PieChart,
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: 'goal_progress',
    label: 'Goal Progress',
    description: 'Goal tracking, SIP adequacy, and projected outcomes',
    icon: Target,
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'tax_summary',
    label: 'Tax Planning',
    description: 'Capital gains breakdown, tax liability, and harvesting opportunities',
    icon: Calculator,
    color: 'from-amber-500 to-amber-600',
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive Review',
    description: 'Full review combining portfolio, goals, and tax analysis',
    icon: ClipboardList,
    color: 'from-purple-500 to-purple-600',
  },
]

function formatCurrency(val) {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val)
}

// Simple markdown to HTML renderer for report content
function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-[#1B2A4A] mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-[#1B2A4A] mt-8 mb-3 pb-2 border-b border-gray-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-[#1B2A4A] mt-6 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#1B2A4A]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200" />')
    // Bullet points (handle nested)
    .replace(/^(\s*)[-*] (.+)$/gm, (_, spaces, content) => {
      const indent = spaces.length > 1 ? 'ml-6' : ''
      return `<li class="flex items-start gap-2 ${indent} mb-1"><span class="text-[#D4A847] mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[#D4A847] inline-block"></span><span>${content}</span></li>`
    })
    // Numbered lists
    .replace(/^\d+\.\s(.+)$/gm, '<li class="flex items-start gap-2 mb-1"><span class="text-[#D4A847] font-semibold shrink-0">&#8226;</span><span>$1</span></li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="mb-3 text-gray-700 leading-relaxed">')
    // Single newlines within lists — keep as is
    .replace(/\n/g, '<br/>')

  return `<p class="mb-3 text-gray-700 leading-relaxed">${html}</p>`
}

export default function ReportGenerator() {
  const { clients } = useClientContext()
  const { showToast } = useToast()
  const reportRef = useRef(null)

  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedType, setSelectedType] = useState('comprehensive')
  const [customInstructions, setCustomInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState(null)

  async function handleGenerate() {
    if (!selectedClientId) {
      showToast('Please select a client', 'error')
      return
    }

    setGenerating(true)
    setReport(null)
    try {
      const result = await generateReport({
        clientId: parseInt(selectedClientId),
        reportType: selectedType,
        customInstructions: customInstructions.trim() || undefined,
      })
      setReport(result)
      showToast('Report generated successfully!', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  function handlePrint() {
    const printContent = reportRef.current
    if (!printContent) return

    const printWindow = window.open('', '_blank')
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${report.reportLabel} - ${report.client.name} | Tejova</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px; line-height: 1.6; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #D4A847; padding-bottom: 20px; margin-bottom: 30px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-logo { width: 40px; height: 40px; background: #1B2A4A; color: #D4A847; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; border-radius: 8px; }
    .brand-name { font-size: 22px; font-weight: bold; color: #1B2A4A; }
    .brand-sub { font-size: 11px; color: #888; }
    .meta { text-align: right; font-size: 13px; color: #666; }
    .meta strong { color: #1B2A4A; }
    h1 { font-size: 24px; color: #1B2A4A; margin: 20px 0 16px; }
    h2 { font-size: 20px; color: #1B2A4A; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
    h3 { font-size: 16px; color: #1B2A4A; margin: 18px 0 8px; }
    p { margin-bottom: 10px; color: #444; }
    li { margin-bottom: 4px; list-style: none; }
    li::before { content: "\\2022"; color: #D4A847; font-weight: bold; display: inline-block; width: 1em; }
    strong { color: #1B2A4A; }
    hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #D4A847; font-size: 11px; color: #888; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-logo">T</div>
      <div>
        <div class="brand-name">TEJOVA</div>
        <div class="brand-sub">MFD Ops Toolkit</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>${report.client.name}</strong></div>
      <div>${report.reportLabel}</div>
      <div>${new Date(report.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>
  ${reportRef.current.innerHTML}
  <div class="footer">
    Generated by Tejova MFD Ops Toolkit | This is a computer-generated report and does not require a signature.<br/>
    Mutual fund investments are subject to market risks. Please read all scheme related documents carefully before investing.
  </div>
</body>
</html>`)
    printWindow.document.close()
    printWindow.print()
  }

  const selectedClient = clients.find(c => c.id === parseInt(selectedClientId))

  return (
    <div className="p-4 lg:p-8 pt-16 lg:pt-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-gradient-to-br from-[#1B2A4A] to-[#2a3f6e] rounded-xl text-[#D4A847]">
          <FileText size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1B2A4A]">AI Report Generator</h1>
          <p className="text-sm text-gray-500">Generate branded client reports powered by AI</p>
        </div>
      </div>

      {/* Configuration Panel */}
      {!report && (
        <div className="space-y-6">
          {/* Client Selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-semibold text-[#1B2A4A] mb-2">Select Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full md:w-96 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847] outline-none text-sm"
            >
              <option value="">-- Choose a client --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Report Type Selector */}
          <div>
            <h2 className="text-sm font-semibold text-[#1B2A4A] mb-3">Report Type</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {REPORT_TYPES.map(type => {
                const Icon = type.icon
                const isSelected = selectedType === type.id
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[#D4A847] bg-[#D4A847]/5 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-[#D4A847] rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${type.color} flex items-center justify-center mb-3`}>
                      <Icon size={20} className="text-white" />
                    </div>
                    <h3 className="font-semibold text-[#1B2A4A] text-sm">{type.label}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{type.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Instructions (collapsible) */}
          <div className="bg-white rounded-xl border border-gray-200">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <span className="text-sm font-semibold text-[#1B2A4A]">Custom Instructions (Optional)</span>
              {showInstructions ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {showInstructions && (
              <div className="px-4 pb-4">
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="E.g., 'Focus on retirement readiness', 'Highlight underperformers', 'Client is risk-averse, emphasize debt allocation'..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D4A847]/40 focus:border-[#D4A847] outline-none text-sm resize-none"
                />
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generating || !selectedClientId}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#1B2A4A] to-[#2a3f6e] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Report
              </>
            )}
          </button>

          {/* Generating state */}
          {generating && (
            <div className="bg-gradient-to-r from-[#1B2A4A]/5 to-[#D4A847]/5 rounded-xl p-8 text-center">
              <Loader2 size={40} className="animate-spin text-[#D4A847] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[#1B2A4A]">Generating your report...</h3>
              <p className="text-sm text-gray-500 mt-1">AI is analyzing client data and crafting personalized insights</p>
            </div>
          )}
        </div>
      )}

      {/* Report Preview */}
      {report && (
        <div className="space-y-4">
          {/* Report Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={14} />
                <span className="font-semibold text-[#1B2A4A]">{report.client.name}</span>
              </div>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={14} />
                {report.reportLabel}
              </div>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar size={14} />
                {new Date(report.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReport(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                New Report
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg hover:bg-[#243558] transition-colors"
              >
                <Printer size={14} />
                Print / Save PDF
              </button>
            </div>
          </div>

          {/* Report Content */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            {/* Branded Header */}
            <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2a3f6e] rounded-t-xl px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#D4A847] flex items-center justify-center font-bold text-[#1B2A4A] text-xl">
                    T
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#D4A847] tracking-wide">TEJOVA</h2>
                    <p className="text-xs text-gray-300">MFD Ops Toolkit</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-white">{report.client.name}</p>
                  <p className="text-gray-300">{report.reportLabel}</p>
                  <p className="text-gray-400 text-xs">
                    {new Date(report.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary Cards (from raw data) */}
            {report.data?.portfolioSummary && report.data.portfolioSummary.holdingsCount > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 border-b border-gray-200">
                <div className="bg-white p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Invested</p>
                  <p className="text-lg font-bold text-[#1B2A4A]">{formatCurrency(report.data.portfolioSummary.totalInvested)}</p>
                </div>
                <div className="bg-white p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Current Value</p>
                  <p className="text-lg font-bold text-[#1B2A4A]">{formatCurrency(report.data.portfolioSummary.currentValue)}</p>
                </div>
                <div className="bg-white p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Gain</p>
                  <p className={`text-lg font-bold ${report.data.portfolioSummary.totalGain >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(report.data.portfolioSummary.totalGain)}
                  </p>
                </div>
                <div className="bg-white p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Returns</p>
                  <p className={`text-lg font-bold ${report.data.portfolioSummary.gainPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {report.data.portfolioSummary.gainPercent}%
                  </p>
                </div>
              </div>
            )}

            {/* AI-Generated Content */}
            <div
              ref={reportRef}
              className="px-8 py-6 report-content prose max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(report.content) }}
            />

            {/* Footer */}
            <div className="px-8 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Sparkles size={12} />
                <span>Generated by Tejova AI Report Engine | This is a computer-generated report</span>
              </div>
            </div>
          </div>

          {/* SEBI Disclaimer */}
          <div className="flex items-start gap-2 p-4 bg-amber-50 rounded-xl border border-amber-200">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Disclaimer:</strong> Mutual fund investments are subject to market risks. Please read all scheme related documents carefully before investing. Past performance is not indicative of future returns. This report is for informational purposes only and should not be considered as investment advice. Tax calculations are estimates based on Budget 2024 rules and may vary based on individual circumstances.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
