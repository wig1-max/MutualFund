const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

export function searchFunds(query, options = {}) {
  return request(`/funds/search?q=${encodeURIComponent(query)}`, options)
}

export function getFundNav(schemeCode) {
  return request(`/funds/${schemeCode}/nav`)
}

export function getLatestNav(schemeCode) {
  return request(`/funds/${schemeCode}/nav/latest`)
}

export function compareFunds(schemeCodes) {
  return request(`/funds/compare?codes=${schemeCodes.join(',')}`)
}

export function getCategories() {
  return request('/funds/categories')
}

export function syncAmfiData() {
  return request('/funds/sync', { method: 'POST' })
}

export function calculateReturns(schemeCode) {
  return request(`/funds/${schemeCode}/returns`)
}

export function getRollingReturns(schemeCode, window = 3, period = '5y') {
  return request(
    `/funds/${schemeCode}/returns/rolling?window=${window}&period=${encodeURIComponent(period)}`
  )
}

export function getRiskMetrics(schemeCode) {
  return request(`/funds/${schemeCode}/risk`)
}

export function sipBacktest(params) {
  const qs = new URLSearchParams(params).toString()
  return request(`/funds/sip-backtest?${qs}`)
}

export function getCategoryHeatmap() {
  return request('/funds/heatmap')
}

export function getFundByCode(schemeCode) {
  return request(`/funds/by-code/${schemeCode}`)
}

// ---- Client CRM ----

export function getClients(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return request(`/clients${qs ? '?' + qs : ''}`)
}

export function getClient(id) {
  return request(`/clients/${id}`)
}

export function createClient(data) {
  return request('/clients', { method: 'POST', body: JSON.stringify(data) })
}

export function updateClient(id, data) {
  return request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteClient(id) {
  return request(`/clients/${id}`, { method: 'DELETE' })
}

export function addClientNote(clientId, note) {
  return request(`/clients/${clientId}/notes`, { method: 'POST', body: JSON.stringify({ note }) })
}

export function deleteClientNote(clientId, noteId) {
  return request(`/clients/${clientId}/notes/${noteId}`, { method: 'DELETE' })
}

export function completeClientReview(clientId) {
  return request(`/clients/${clientId}/complete-review`, { method: 'POST' })
}

export function getClientStats() {
  return request('/clients/stats')
}

// ---- Backup ----

export function downloadBackup() {
  // Direct download — triggers browser file save
  window.location.href = `${BASE_URL}/backup`
}

// ---- Portfolio X-Ray ----

export function getTotalAum() {
  return request('/portfolio/total-aum')
}

export function getPortfolio(clientId) {
  return request(`/portfolio/${clientId}`)
}

export function addHolding(clientId, data) {
  return request(`/portfolio/${clientId}/holdings`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateHolding(clientId, holdingId, data) {
  return request(`/portfolio/${clientId}/holdings/${holdingId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteHolding(clientId, holdingId) {
  return request(`/portfolio/${clientId}/holdings/${holdingId}`, { method: 'DELETE' })
}

export function getPortfolioAnalysis(clientId) {
  return request(`/portfolio/${clientId}/analysis`)
}

// ---- Goal-Based SIP Planner ----

export function getGoals(clientId) {
  return request(`/goals/${clientId}`)
}

export function createGoal(clientId, data) {
  return request(`/goals/${clientId}`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateGoal(clientId, goalId, data) {
  return request(`/goals/${clientId}/${goalId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteGoal(clientId, goalId) {
  return request(`/goals/${clientId}/${goalId}`, { method: 'DELETE' })
}

export function calculateGoalSip(data) {
  return request('/goals/calculate', { method: 'POST', body: JSON.stringify(data) })
}

export function getGoalsSummary(clientId) {
  return request(`/goals/${clientId}/summary`)
}

export function getGoalAllocation(clientId, goalId) {
  return request(`/goals/${clientId}/${goalId}/allocation`)
}

export function saveGoalAllocation(clientId, goalId, data) {
  return request(`/goals/${clientId}/${goalId}/allocation`, { method: 'POST', body: JSON.stringify(data) })
}

// ---- Tax Optimization ----

export function getTaxAnalysis(clientId) {
  return request(`/tax/${clientId}/analysis`)
}

export function estimateTax(data) {
  return request('/tax/estimate', { method: 'POST', body: JSON.stringify(data) })
}

export function getHouseholdTax(clientId, slabRate) {
  const qs = slabRate ? `?slab_rate=${slabRate}` : ''
  return request(`/tax/${clientId}/household${qs}`)
}

export function getTaxRules() {
  return request('/tax/rules')
}

// ---- AI Report Generator ----

export function getReportTypes() {
  return request('/reports/types')
}

export function generateReport(data) {
  return request('/reports/generate', { method: 'POST', body: JSON.stringify(data) })
}

// ---- Client Profiling ----

export function getClientProfile(clientId) {
  return request(`/profiling/${clientId}`)
}

export function saveClientProfile(clientId, data) {
  return request(`/profiling/${clientId}`, { method: 'POST', body: JSON.stringify(data) })
}

export function getProfilingSummary() {
  return request('/profiling/summary/all')
}

// ---- Scoring & Recommendations ----

export function runScoring(clientId, options = {}) {
  return request(`/scoring/${clientId}/run`, { method: 'POST', body: JSON.stringify(options) })
}

export function getRecommendations(clientId) {
  return request(`/scoring/${clientId}/recommendations`)
}

export function enrichFundMetrics(schemeCode) {
  return request(`/scoring/enrich-metrics/${schemeCode}`, { method: 'POST' })
}

// ---- CAS Import ----

export function parseCasText(clientId, casText) {
  return request(`/cas/${clientId}/parse`, { method: 'POST', body: JSON.stringify({ cas_text: casText }) })
}

export function importCasHoldings(clientId, folios, replaceExisting = true) {
  return request(`/cas/${clientId}/import`, { method: 'POST', body: JSON.stringify({ folios, replace_existing: replaceExisting }) })
}

export function getCasHoldings(clientId) {
  return request(`/cas/${clientId}`)
}

export function clearCasHoldings(clientId) {
  return request(`/cas/${clientId}`, { method: 'DELETE' })
}

export function getCasTransactions(clientId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return request(`/cas/${clientId}/transactions${qs ? '?' + qs : ''}`)
}

// ---- Household Assets ----

export function getAssetTypes() {
  return request('/assets/types')
}

export function getClientAssets(clientId) {
  return request(`/assets/${clientId}`)
}

export function addClientAsset(clientId, data) {
  return request(`/assets/${clientId}`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateClientAsset(clientId, assetId, data) {
  return request(`/assets/${clientId}/${assetId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteClientAsset(clientId, assetId) {
  return request(`/assets/${clientId}/${assetId}`, { method: 'DELETE' })
}

// ---- Wealth Summary ----

export function getWealthSummary(clientId) {
  return request(`/wealth/${clientId}/summary`)
}

export function getTotalWealth() {
  return request('/wealth/total')
}

// ---- Client Loans ----

export function getLoanTypes() {
  return request('/loans/types')
}

export function getClientLoans(clientId) {
  return request(`/loans/${clientId}`)
}

export function addClientLoan(clientId, data) {
  return request(`/loans/${clientId}`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateClientLoan(clientId, loanId, data) {
  return request(`/loans/${clientId}/${loanId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteClientLoan(clientId, loanId) {
  return request(`/loans/${clientId}/${loanId}`, { method: 'DELETE' })
}
