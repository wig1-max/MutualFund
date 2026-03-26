import { getDb } from '../db/index.js'
import { fetchNavHistory } from './mfapi.js'

const CACHE_MAX_AGE_HOURS = 24

// Get NAV history for a scheme, using SQLite cache first
export async function getCachedNavHistory(schemeCode) {
  const db = getDb()

  // Check if we have cached data and if it's fresh enough
  const latest = db.prepare(
    'SELECT cached_at FROM nav_cache WHERE scheme_code = ? ORDER BY date DESC LIMIT 1'
  ).get(schemeCode)

  if (latest?.cached_at) {
    const ageHours = (Date.now() - new Date(latest.cached_at + 'Z').getTime()) / (1000 * 60 * 60)
    if (ageHours < CACHE_MAX_AGE_HOURS) {
      // Return from SQLite cache
      const rows = db.prepare(
        'SELECT date, nav FROM nav_cache WHERE scheme_code = ? ORDER BY date ASC'
      ).all(schemeCode)
      return rows
    }
  }

  // Cache miss or stale — fetch from mfapi.in and store
  try {
    const { data: navData } = await fetchNavHistory(schemeCode)

    // Batch insert into nav_cache using a transaction
    const insert = db.prepare(
      'INSERT OR REPLACE INTO nav_cache (scheme_code, date, nav, cached_at) VALUES (?, ?, ?, datetime(\'now\'))'
    )
    const batchInsert = db.transaction((rows) => {
      for (const row of rows) {
        insert.run(schemeCode, row.date, row.nav)
      }
    })
    batchInsert(navData)

    return navData
  } catch (err) {
    // If fetch fails but we have stale cache, return stale data
    if (latest) {
      const rows = db.prepare(
        'SELECT date, nav FROM nav_cache WHERE scheme_code = ? ORDER BY date ASC'
      ).all(schemeCode)
      if (rows.length > 0) return rows
    }
    throw err
  }
}

// Batch prefetch: load multiple schemes' NAVs, hitting mfapi.in only for cache misses
export async function batchPrefetchNavs(schemeCodes) {
  const db = getDb()
  const results = {}
  const misses = []

  for (const code of schemeCodes) {
    const latest = db.prepare(
      'SELECT cached_at FROM nav_cache WHERE scheme_code = ? ORDER BY date DESC LIMIT 1'
    ).get(code)

    if (latest?.cached_at) {
      const ageHours = (Date.now() - new Date(latest.cached_at + 'Z').getTime()) / (1000 * 60 * 60)
      if (ageHours < CACHE_MAX_AGE_HOURS) {
        results[code] = db.prepare(
          'SELECT date, nav FROM nav_cache WHERE scheme_code = ? ORDER BY date ASC'
        ).all(code)
        continue
      }
    }
    misses.push(code)
  }

  // Fetch all cache misses in parallel
  if (misses.length > 0) {
    const fetched = await Promise.allSettled(
      misses.map(async (code) => {
        const { data: navData } = await fetchNavHistory(code)
        // Store in SQLite
        const insert = db.prepare(
          'INSERT OR REPLACE INTO nav_cache (scheme_code, date, nav, cached_at) VALUES (?, ?, ?, datetime(\'now\'))'
        )
        const batchInsert = db.transaction((rows) => {
          for (const row of rows) {
            insert.run(code, row.date, row.nav)
          }
        })
        batchInsert(navData)
        return { code, data: navData }
      })
    )

    for (const result of fetched) {
      if (result.status === 'fulfilled') {
        results[result.value.code] = result.value.data
      }
    }
  }

  return results
}
