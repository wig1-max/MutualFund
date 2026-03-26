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

export function searchFunds(query) {
  return request(`/funds/search?q=${encodeURIComponent(query)}`)
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

// ---- Portfolio X-Ray ----

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
