/**
 * PDF Fetcher — Downloads AMC factsheet PDFs and returns base64 for Claude API.
 */

const MAX_PDF_SIZE = 20 * 1024 * 1024 // 20MB limit

/**
 * Fetch a PDF from a URL and return as base64.
 * @returns {{ base64: string, sizeBytes: number }} or throws
 */
export async function fetchPdfAsBase64(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TejovaBot/1.0)',
        'Accept': 'application/pdf',
      },
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_PDF_SIZE) {
      throw new Error(`PDF too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Max: 20MB.`)
    }

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_PDF_SIZE) {
      throw new Error(`PDF too large (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB). Max: 20MB.`)
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return { base64, sizeBytes: arrayBuffer.byteLength }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Scrape an AMC's factsheet page to find the PDF download link.
 * Falls back to regex-based link extraction from HTML.
 * @returns {string|null} URL of the factsheet PDF
 */
export async function scrapePdfLinkFromPage(pageUrl, monthName) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TejovaBot/1.0)',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const html = await res.text()

    // Look for PDF links containing 'factsheet' and the month name
    const pdfLinkRegex = /href=["']([^"']*?factsheet[^"']*?\.pdf)["']/gi
    const matches = []
    let match
    while ((match = pdfLinkRegex.exec(html)) !== null) {
      matches.push(match[1])
    }

    if (matches.length === 0) return null

    // Prefer links containing the month name
    const monthLower = (monthName || '').toLowerCase()
    const monthMatch = matches.find(url =>
      url.toLowerCase().includes(monthLower)
    )
    if (monthMatch) {
      // Handle relative URLs
      if (monthMatch.startsWith('http')) return monthMatch
      const base = new URL(pageUrl)
      return new URL(monthMatch, base.origin).href
    }

    // Fall back to most recent (last) PDF link
    const lastMatch = matches[matches.length - 1]
    if (lastMatch.startsWith('http')) return lastMatch
    const base = new URL(pageUrl)
    return new URL(lastMatch, base.origin).href
  } catch (e) {
    console.warn(`[PdfFetcher] Scrape failed for ${pageUrl}:`, e.message)
    return null
  }
}
