/**
 * Factsheet Pipeline — Orchestrates the full AMC factsheet fetch → extract → store cycle.
 */
import { getDb } from '../db/index.js'
import { getAmcList, getCurrentFactsheetMonth, buildFactsheetUrl } from './amcRegistry.js'
import { fetchPdfAsBase64, scrapePdfLinkFromPage } from './pdfFetcher.js'
import { extractFactsheetData, calculateManagerTenure } from './factsheetExtractor.js'

const delay = ms => new Promise(r => setTimeout(r, ms))

/**
 * Run the full factsheet pipeline for a given month.
 * Fetches PDFs from each AMC, extracts fund data, stores in SQLite.
 */
export async function runFactsheetPipeline(month, options = {}) {
  const { forceRefetch = false } = options
  const db = getDb()
  const amcList = getAmcList()

  // Determine month info
  let monthInfo
  if (month) {
    // Parse YYYY-MM into monthName and year
    const [y, m] = month.split('-')
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ]
    monthInfo = {
      monthName: months[parseInt(m, 10) - 1],
      year: y,
      yyyymm: month,
    }
  } else {
    monthInfo = getCurrentFactsheetMonth()
  }

  console.log(`[FactsheetPipeline] Starting pipeline for ${monthInfo.yyyymm} (${amcList.length} AMCs)`)

  const results = { total: amcList.length, fetched: 0, extracted: 0, failed: 0, skipped: 0 }

  // Ensure amc_factsheet_sources has entries for all AMCs
  const upsertSource = db.prepare(`
    INSERT OR IGNORE INTO amc_factsheet_sources (amc_name, amc_slug)
    VALUES (?, ?)
  `)
  for (const amc of amcList) {
    upsertSource.run(amc.name, amc.slug)
  }

  for (const amc of amcList) {
    try {
      // Check if already extracted for this month (skip unless force)
      if (!forceRefetch) {
        const existing = db.prepare(
          `SELECT COUNT(*) as c FROM fund_factsheets
           WHERE amc = ? AND factsheet_month = ?`
        ).get(amc.code, monthInfo.yyyymm)
        if (existing?.c > 0) {
          console.log(`[FactsheetPipeline] ${amc.code} already extracted for ${monthInfo.yyyymm} — skipping`)
          results.skipped++
          continue
        }
      }

      // Step 1: Fetch PDF
      console.log(`[FactsheetPipeline] Fetching ${amc.code}...`)
      let pdfResult = null

      // Try direct URL template first
      const directUrl = buildFactsheetUrl(amc.code, monthInfo.monthName, monthInfo.year)
      try {
        pdfResult = await fetchPdfAsBase64(directUrl)
        console.log(`[FactsheetPipeline] ${amc.code} PDF fetched (${(pdfResult.sizeBytes / 1024 / 1024).toFixed(1)}MB)`)
      } catch (e) {
        console.warn(`[FactsheetPipeline] Direct URL failed for ${amc.code}: ${e.message}`)

        // Fallback: scrape the page for PDF link
        if (amc.pageUrl) {
          console.log(`[FactsheetPipeline] Trying scrape fallback for ${amc.code}...`)
          const scrapedUrl = await scrapePdfLinkFromPage(amc.pageUrl, monthInfo.monthName)
          if (scrapedUrl) {
            try {
              pdfResult = await fetchPdfAsBase64(scrapedUrl)
              console.log(`[FactsheetPipeline] ${amc.code} PDF fetched via scrape (${(pdfResult.sizeBytes / 1024 / 1024).toFixed(1)}MB)`)
            } catch (e2) {
              console.error(`[FactsheetPipeline] Scrape URL also failed for ${amc.code}: ${e2.message}`)
            }
          }
        }
      }

      if (!pdfResult) {
        console.error(`[FactsheetPipeline] ${amc.code} — could not fetch PDF`)
        db.prepare(`
          UPDATE amc_factsheet_sources
          SET last_fetched = datetime('now'), last_fetch_status = 'failed'
          WHERE amc_name = ?
        `).run(amc.name)
        results.failed++
        await delay(2000)
        continue
      }

      results.fetched++

      // Step 2: Extract data using Claude
      console.log(`[FactsheetPipeline] Extracting data from ${amc.code}...`)
      let extractedFunds
      try {
        extractedFunds = await extractFactsheetData(pdfResult.base64, amc.code, monthInfo.yyyymm)
      } catch (e) {
        console.error(`[FactsheetPipeline] Extraction failed for ${amc.code}: ${e.message}`)
        db.prepare(`
          UPDATE amc_factsheet_sources
          SET last_fetched = datetime('now'), last_fetch_status = 'extraction_failed'
          WHERE amc_name = ?
        `).run(amc.name)
        results.failed++
        await delay(3000)
        continue
      }

      // Step 3: Store extracted data and fuzzy-match to scheme_codes
      const insertFactsheet = db.prepare(`
        INSERT OR REPLACE INTO fund_factsheets (
          scheme_code, amc, fund_name_raw, factsheet_month, source_url,
          expense_ratio, aum_cr, fund_manager, manager_tenure_years,
          portfolio_turnover, benchmark, exit_load,
          top_holdings, sector_allocation, portfolio_pe, portfolio_pb,
          large_cap_pct, mid_cap_pct, small_cap_pct,
          investment_style, investment_objective,
          extraction_confidence, extracted_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, datetime('now')
        )
      `)

      const updateMetrics = db.prepare(`
        UPDATE fund_metrics SET
          expense_ratio = ?,
          aum_cr = ?,
          manager_tenure_years = ?,
          portfolio_pe = ?
        WHERE scheme_code = ?
      `)

      let matchedCount = 0
      for (const fund of extractedFunds) {
        const fundName = fund.fund_name || ''
        const tenure = calculateManagerTenure(fund.manager_since)

        // Fuzzy match: build LIKE pattern from fund name keywords
        const schemeCode = fuzzyMatchFund(db, fundName, amc.code)

        insertFactsheet.run(
          schemeCode,
          amc.code,
          fundName,
          monthInfo.yyyymm,
          directUrl,
          fund.expense_ratio ?? null,
          fund.aum_cr ?? null,
          fund.fund_manager ?? null,
          tenure,
          fund.portfolio_turnover ?? null,
          fund.benchmark ?? null,
          fund.exit_load ?? null,
          fund.top_holdings ? JSON.stringify(fund.top_holdings) : null,
          fund.sector_allocation ? JSON.stringify(fund.sector_allocation) : null,
          fund.portfolio_pe ?? null,
          fund.portfolio_pb ?? null,
          fund.large_cap_pct ?? null,
          fund.mid_cap_pct ?? null,
          fund.small_cap_pct ?? null,
          fund.investment_style ?? null,
          fund.investment_objective ?? null,
          'medium'
        )

        // If matched, update fund_metrics with factsheet data
        if (schemeCode) {
          matchedCount++
          updateMetrics.run(
            fund.expense_ratio ?? null,
            fund.aum_cr ?? null,
            tenure,
            fund.portfolio_pe ?? null,
            schemeCode
          )
        }
      }

      // Update source status
      db.prepare(`
        UPDATE amc_factsheet_sources
        SET last_fetched = datetime('now'),
            last_fetch_status = 'extracted',
            funds_extracted = ?
        WHERE amc_name = ?
      `).run(extractedFunds.length, amc.name)

      results.extracted++
      console.log(
        `[FactsheetPipeline] ${amc.code}: ${extractedFunds.length} funds extracted, ` +
        `${matchedCount} matched to scheme codes`
      )

      // Rate limit between AMCs
      await delay(3000)
    } catch (e) {
      console.error(`[FactsheetPipeline] Unexpected error for ${amc.code}:`, e.message)
      results.failed++
      await delay(2000)
    }
  }

  console.log(
    `[FactsheetPipeline] Complete. Fetched: ${results.fetched}, ` +
    `Extracted: ${results.extracted}, Failed: ${results.failed}, Skipped: ${results.skipped}`
  )
  return results
}

/**
 * Fuzzy match an extracted fund name to a scheme_code in the funds table.
 * Strategy: take key words from fund name, build a LIKE chain.
 */
function fuzzyMatchFund(db, fundName, amcCode) {
  if (!fundName) return null

  // Clean and extract keywords
  const cleaned = fundName
    .replace(/[-–—]/g, ' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  const stopWords = new Set([
    'fund', 'plan', 'option', 'regular', 'growth', 'the', 'of', 'and', 'scheme',
    'series', 'annual', 'monthly', 'quarterly', 'idcw', 'dividend', 'direct',
  ])

  const words = cleaned.split(' ').filter(w =>
    w.length > 2 && !stopWords.has(w)
  )

  if (words.length === 0) return null

  // Take first 4 significant words for matching
  const matchWords = words.slice(0, 4)
  const likePattern = `%${matchWords.join('%')}%`

  // Prefer Regular Growth plans (not Direct, not IDCW)
  const result = db.prepare(`
    SELECT scheme_code FROM funds
    WHERE LOWER(scheme_name) LIKE ?
      AND LOWER(scheme_name) NOT LIKE '%direct%'
      AND LOWER(scheme_name) NOT LIKE '%idcw%'
      AND LOWER(scheme_name) NOT LIKE '%dividend%'
    LIMIT 1
  `).get(likePattern)

  return result?.scheme_code || null
}

/**
 * Run the pipeline in the background (non-blocking).
 */
export async function runFactsheetPipelineBackground(month) {
  try {
    await runFactsheetPipeline(month)
  } catch (e) {
    console.error('[FactsheetPipeline] Background run failed:', e.message)
  }
}

/**
 * Update fund_metrics from existing factsheet data (no fetch needed).
 * Useful for re-propagating after manual matching.
 */
export function updateMetricsFromFactsheets() {
  const db = getDb()
  const matched = db.prepare(`
    SELECT ff.scheme_code, ff.expense_ratio, ff.aum_cr,
           ff.manager_tenure_years, ff.portfolio_pe
    FROM fund_factsheets ff
    WHERE ff.scheme_code IS NOT NULL
    GROUP BY ff.scheme_code
    HAVING ff.factsheet_month = MAX(ff.factsheet_month)
  `).all()

  const update = db.prepare(`
    UPDATE fund_metrics SET
      expense_ratio = ?,
      aum_cr = ?,
      manager_tenure_years = ?,
      portfolio_pe = ?
    WHERE scheme_code = ?
  `)

  let updated = 0
  for (const f of matched) {
    const changes = update.run(
      f.expense_ratio, f.aum_cr, f.manager_tenure_years, f.portfolio_pe,
      f.scheme_code
    ).changes
    if (changes > 0) updated++
  }

  console.log(`[FactsheetPipeline] Updated ${updated} fund_metrics from factsheet data`)
  return updated
}
