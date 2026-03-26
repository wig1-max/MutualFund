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
  const params = schemeCodes.map((c) => `codes=${c}`).join('&')
  return request(`/funds/compare?${params}`)
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
