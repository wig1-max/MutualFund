import { getDb } from '../db/index.js'
import { calculateReturns, standardDeviation, maxDrawdown,
         sharpeRatio, sortinoRatio, calmarRatio,
         fundAgeYears } from './calculations.js'

const BATCH_SIZE = 20
const BATCH_DELAY_MS = 500

export async function runMetricsJob() {
  const db = getDb()

  // STEP 1 — Find candidates with enough NAV data
  const candidates = db.prepare(`
    SELECT scheme_code, COUNT(*) as data_points,
           MIN(date) as earliest, MAX(date) as latest
    FROM nav_cache
    GROUP BY scheme_code
    HAVING data_points >= 250
    ORDER BY data_points DESC
  `).all()

  console.log(`[MetricsJob] Processing ${candidates.length} funds...`)

  if (candidates.length === 0) {
    console.log('[MetricsJob] No funds with 250+ NAV data points. Skipping.')
    return
  }

  // STEP 2 — Skip recently computed funds (within 7 days)
  const toProcess = []
  for (const c of candidates) {
    const existing = db.prepare(
      'SELECT computed_at FROM fund_metrics WHERE scheme_code = ?'
    ).get(c.scheme_code)

    if (existing && existing.computed_at) {
      const computedAt = new Date(existing.computed_at)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      if (computedAt > sevenDaysAgo) continue
    }

    toProcess.push(c)
  }

  console.log(`[MetricsJob] ${toProcess.length} funds need updating (${candidates.length - toProcess.length} skipped as recent).`)

  if (toProcess.length === 0) return

  // STEP 3 — Process in batches
  let processed = 0
  const batches = []
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    batches.push(toProcess.slice(i, i + BATCH_SIZE))
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO fund_metrics (
      scheme_code, std_deviation, max_drawdown, sharpe_ratio,
      sortino_ratio, calmar_ratio, jensen_alpha,
      return_1y, return_3y, return_5y, risk_level,
      data_quality_score, age_years, nav_data_points,
      metrics_date, computed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,date('now'),datetime('now'))
  `)

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    let batchCount = 0

    for (const candidate of batch) {
      try {
        // a) Pull NAV data from nav_cache
        const navRows = db.prepare(
          'SELECT date, nav FROM nav_cache WHERE scheme_code = ? ORDER BY date ASC'
        ).all(candidate.scheme_code)

        const navData = navRows.map(r => ({
          date: r.date,
          nav: parseFloat(r.nav),
        }))

        if (navData.length < 30) continue

        // b) Compute metrics
        const returns = calculateReturns(navData)
        const stdDev = standardDeviation(navData, 3)
        const md = maxDrawdown(navData, 3)
        const sharpe = sharpeRatio(navData, 6.5, 3)
        const sortino = sortinoRatio(navData, 6.5, 3)
        const calmar = calmarRatio(navData, 3)
        const ageYears = fundAgeYears(navData)

        const return1y = returns['1Y']?.return ?? null
        const return3y = returns['3Y']?.return ?? null
        const return5y = returns['5Y']?.return ?? null

        // c) Data quality score
        const navDataPoints = navData.length
        const dataQualityScore = Math.min(100, navDataPoints / 25)

        // Look up risk level from funds table
        const fundInfo = db.prepare(
          'SELECT scheme_category FROM funds WHERE scheme_code = ?'
        ).get(candidate.scheme_code)

        // e) Insert
        insertStmt.run(
          candidate.scheme_code,
          stdDev,
          md,
          sharpe,
          sortino,
          calmar,
          null,  // jensen_alpha — skipped (needs benchmark alignment)
          return1y,
          return3y,
          return5y,
          fundInfo?.scheme_category || null,
          dataQualityScore,
          Math.round(ageYears * 10) / 10,
          navDataPoints,
        )

        batchCount++
        processed++
      } catch (err) {
        console.warn(`[MetricsJob] Error processing ${candidate.scheme_code}: ${err.message}`)
      }
    }

    console.log(`[MetricsJob] Batch ${batchIdx + 1}/${batches.length}: computed ${batchCount} funds`)

    // d) After each batch, compute and update category averages
    try {
      const categoryAvgs = db.prepare(`
        SELECT f.scheme_category,
               AVG(fm.return_1y) as avg_1y,
               AVG(fm.return_3y) as avg_3y
        FROM fund_metrics fm
        JOIN funds f ON f.scheme_code = fm.scheme_code
        WHERE fm.return_1y IS NOT NULL
        GROUP BY f.scheme_category
      `).all()

      const updateAvg = db.prepare(
        'UPDATE fund_metrics SET category_avg_1y = ?, category_avg_3y = ? WHERE scheme_code = ?'
      )

      const categoryMap = new Map()
      for (const row of categoryAvgs) {
        categoryMap.set(row.scheme_category, { avg_1y: row.avg_1y, avg_3y: row.avg_3y })
      }

      // Update this batch's funds with their category averages
      for (const candidate of batch) {
        const fundInfo = db.prepare(
          'SELECT scheme_category FROM funds WHERE scheme_code = ?'
        ).get(candidate.scheme_code)
        if (fundInfo && categoryMap.has(fundInfo.scheme_category)) {
          const avgs = categoryMap.get(fundInfo.scheme_category)
          updateAvg.run(avgs.avg_1y, avgs.avg_3y, candidate.scheme_code)
        }
      }
    } catch (err) {
      console.warn(`[MetricsJob] Category avg update error: ${err.message}`)
    }

    // Delay between batches
    if (batchIdx < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  console.log(`[MetricsJob] Complete. ${processed} funds updated.`)
}

export async function runMetricsJobBackground() {
  try {
    await runMetricsJob()
  } catch (err) {
    console.error('[MetricsJob] Background job error:', err.message)
  }
}
