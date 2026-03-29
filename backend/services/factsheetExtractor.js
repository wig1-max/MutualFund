/**
 * Factsheet Extractor — Uses Claude API to extract structured fund data from AMC factsheet PDFs.
 */
import Anthropic from '@anthropic-ai/sdk'

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }
  return new Anthropic({ apiKey })
}

const EXTRACTION_PROMPT = `You are a financial data extraction specialist. Extract structured data from this Indian mutual fund factsheet PDF.

For EACH fund listed in this factsheet, extract the following fields. Return ONLY a valid JSON array — no markdown, no explanation, no wrapping.

Each fund object must have these fields:
{
  "fund_name": "Exact fund name as printed (include Regular/Direct, Growth/IDCW)",
  "category": "SEBI category (e.g., Large Cap Fund, Flexi Cap Fund, ELSS)",
  "expense_ratio": <number — Total Expense Ratio as percentage, e.g. 1.62 for 1.62%>,
  "aum_cr": <number — AUM in crores, e.g. 45230.5>,
  "fund_manager": "Primary fund manager name",
  "manager_since": "Date string when manager took charge, e.g. 'June 2018'",
  "benchmark": "Benchmark index name",
  "exit_load": "Exit load description as text",
  "portfolio_pe": <number or null — Portfolio P/E ratio if shown>,
  "portfolio_pb": <number or null — Portfolio P/B ratio if shown>,
  "portfolio_turnover": <number or null — Turnover ratio as percentage>,
  "top_holdings": [{"name": "Stock/Bond name", "pct": <percentage>}],
  "sector_allocation": [{"sector": "Sector name", "pct": <percentage>}],
  "large_cap_pct": <number or null — % in large cap>,
  "mid_cap_pct": <number or null — % in mid cap>,
  "small_cap_pct": <number or null — % in small cap>,
  "investment_style": "Growth/Value/Blend or null",
  "investment_objective": "Brief objective text or null"
}

Rules:
- Extract ALL funds shown in the factsheet, both Regular and Direct plans
- expense_ratio must be a number (percentage), NOT a string
- aum_cr must be a number in crores
- For top_holdings, extract up to 10 holdings with name and percentage
- For sector_allocation, extract all sectors shown
- If a field is not available in the PDF, use null
- Return valid JSON array only — no markdown code blocks, no text before or after`

/**
 * Extract structured fund data from a factsheet PDF using Claude.
 * @param {string} pdfBase64 - Base64-encoded PDF
 * @param {string} amcCode - AMC identifier
 * @param {string} month - YYYY-MM format
 * @returns {Array} Array of extracted fund objects
 */
export async function extractFactsheetData(pdfBase64, amcCode, month) {
  const client = getAnthropicClient()

  console.log(`[FactsheetExtractor] Sending ${amcCode} ${month} PDF to Claude for extraction...`)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64,
          },
        },
        {
          type: 'text',
          text: EXTRACTION_PROMPT,
        },
      ],
    }],
  })

  const responseText = message.content[0]?.text || ''

  // Parse JSON — handle potential markdown wrapping
  let cleaned = responseText.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  cleaned = cleaned.trim()

  try {
    const funds = JSON.parse(cleaned)
    if (!Array.isArray(funds)) {
      throw new Error('Expected JSON array')
    }
    console.log(`[FactsheetExtractor] Extracted ${funds.length} funds from ${amcCode} ${month}`)
    return funds
  } catch (e) {
    console.error(`[FactsheetExtractor] JSON parse error for ${amcCode}:`, e.message)
    console.error(`[FactsheetExtractor] Response preview:`, responseText.slice(0, 200))
    throw new Error(`Failed to parse extraction result for ${amcCode}: ${e.message}`)
  }
}

/**
 * Calculate manager tenure in years from a "since" date string.
 * @param {string} managerSince - e.g., "June 2018" or "2018-06-15"
 * @returns {number|null}
 */
export function calculateManagerTenure(managerSince) {
  if (!managerSince) return null
  try {
    const since = new Date(managerSince)
    if (isNaN(since.getTime())) return null
    const years = (Date.now() - since.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    return Math.round(years * 10) / 10
  } catch {
    return null
  }
}
