const MFAPI_BASE = 'https://api.mfapi.in/mf'

// In-memory cache with TTL
const cache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours for historical data
const LATEST_CACHE_TTL = 60 * 60 * 1000 // 1 hour for latest NAV

function getCached(key, ttl) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < ttl) return entry.data
  return null
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() })
}

export async function fetchNavHistory(schemeCode) {
  const cacheKey = `nav_${schemeCode}`
  const cached = getCached(cacheKey, CACHE_TTL)
  if (cached) return cached

  const res = await fetch(`${MFAPI_BASE}/${schemeCode}`)
  if (!res.ok) throw new Error(`MFapi error: ${res.status}`)
  const data = await res.json()

  if (data.status === 'ERROR' || !data.data) {
    throw new Error(data.message || 'Fund not found')
  }

  // Parse dates from DD-MM-YYYY to YYYY-MM-DD and sort ascending
  const navData = data.data.map(d => ({
    date: d.date.split('-').reverse().join('-'),
    nav: parseFloat(d.nav),
  })).sort((a, b) => a.date.localeCompare(b.date))

  const result = { meta: data.meta, data: navData }
  setCache(cacheKey, result)
  return result
}

export async function fetchLatestNav(schemeCode) {
  const cacheKey = `latest_${schemeCode}`
  const cached = getCached(cacheKey, LATEST_CACHE_TTL)
  if (cached) return cached

  const res = await fetch(`${MFAPI_BASE}/${schemeCode}/latest`)
  if (!res.ok) throw new Error(`MFapi error: ${res.status}`)
  const data = await res.json()
  setCache(cacheKey, data)
  return data
}
