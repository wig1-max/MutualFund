import { Router } from 'express'
import { getDb } from '../db/index.js'
import { estimateCurrentValue } from '../services/assetValuation.js'
import { getAssetTypeLabel, getWealthBucket } from '../utils/assetClassification.js'

const router = Router()

// GET /api/wealth/:clientId/summary — unified wealth view across MF + other assets
router.get('/wealth/:clientId/summary', (req, res) => {
  const db = getDb()
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.clientId)
  if (!client) return res.status(404).json({ message: 'Client not found' })

  // 1. MF holdings (from client_holdings — manual entries)
  const mfHoldings = db.prepare(
    'SELECT scheme_code, scheme_name, invested_amount, units FROM client_holdings WHERE client_id = ?'
  ).all(req.params.clientId)

  const mfInvested = mfHoldings.reduce((s, h) => s + (h.invested_amount || 0), 0)

  // 2. CAS holdings (if any — imported via CAS upload)
  const casHoldings = db.prepare(
    'SELECT scheme_code, scheme_name, current_value, cost_value FROM cas_holdings WHERE client_id = ?'
  ).all(req.params.clientId)

  const casInvested = casHoldings.reduce((s, h) => s + (h.cost_value || 0), 0)
  const casCurrentValue = casHoldings.reduce((s, h) => s + (h.current_value || 0), 0)

  // 3. Household assets (non-MF)
  const householdAssets = db.prepare(
    'SELECT * FROM household_assets WHERE client_id = ?'
  ).all(req.params.clientId)

  const householdByType = {}
  let householdInvested = 0
  let householdEstimatedValue = 0

  for (const asset of householdAssets) {
    const estimated = estimateCurrentValue(asset)
    const type = asset.asset_type
    if (!householdByType[type]) {
      householdByType[type] = {
        asset_type: type,
        label: getAssetTypeLabel(type),
        bucket: getWealthBucket(type),
        count: 0,
        invested: 0,
        estimated_value: 0,
      }
    }
    householdByType[type].count++
    householdByType[type].invested += asset.invested_amount || 0
    householdByType[type].estimated_value += estimated
    householdInvested += asset.invested_amount || 0
    householdEstimatedValue += estimated
  }

  // 4. Build allocation buckets
  const buckets = {
    mutual_funds: { label: 'Mutual Funds', invested: mfInvested + casInvested, estimated_value: mfInvested + casCurrentValue },
    equity: { label: 'Stocks', invested: 0, estimated_value: 0 },
    debt: { label: 'Fixed Deposits', invested: 0, estimated_value: 0 },
    gold: { label: 'Gold', invested: 0, estimated_value: 0 },
    real_estate: { label: 'Real Estate', invested: 0, estimated_value: 0 },
    retirement: { label: 'Retirement (PF/NPS/EPF)', invested: 0, estimated_value: 0 },
    insurance: { label: 'Insurance', invested: 0, estimated_value: 0 },
    other: { label: 'Other', invested: 0, estimated_value: 0 },
  }

  for (const group of Object.values(householdByType)) {
    const bucket = group.bucket
    if (buckets[bucket]) {
      buckets[bucket].invested += group.invested
      buckets[bucket].estimated_value += group.estimated_value
    } else {
      buckets.other.invested += group.invested
      buckets.other.estimated_value += group.estimated_value
    }
  }

  const totalInvested = mfInvested + casInvested + householdInvested
  const totalEstimated = mfInvested + casCurrentValue + householdEstimatedValue

  res.json({
    client,
    summary: {
      total_invested: totalInvested,
      total_estimated_value: totalEstimated,
      mf_invested: mfInvested + casInvested,
      mf_estimated_value: mfInvested + casCurrentValue,
      mf_holdings_count: mfHoldings.length + casHoldings.length,
      household_invested: householdInvested,
      household_estimated_value: householdEstimatedValue,
      household_assets_count: householdAssets.length,
    },
    buckets: Object.entries(buckets)
      .filter(([, b]) => b.invested > 0 || b.estimated_value > 0)
      .map(([key, b]) => ({
        key,
        ...b,
        pct_of_total: totalEstimated > 0
          ? Math.round((b.estimated_value / totalEstimated) * 10000) / 100
          : 0,
      })),
    household_by_type: Object.values(householdByType),
  })
})

// GET /api/wealth/total — total wealth across ALL clients (for dashboard)
router.get('/wealth/total', (req, res) => {
  const db = getDb()

  const mfTotal = db.prepare(
    'SELECT COALESCE(SUM(invested_amount), 0) as total FROM client_holdings'
  ).get().total

  const casTotal = db.prepare(
    'SELECT COALESCE(SUM(current_value), 0) as current, COALESCE(SUM(cost_value), 0) as invested FROM cas_holdings'
  ).get()

  const householdAssets = db.prepare('SELECT * FROM household_assets').all()
  let householdInvested = 0
  let householdEstimated = 0
  for (const a of householdAssets) {
    householdInvested += a.invested_amount || 0
    householdEstimated += estimateCurrentValue(a)
  }

  res.json({
    mf_aum: mfTotal + (casTotal.invested || 0),
    mf_current: mfTotal + (casTotal.current || 0),
    household_invested: householdInvested,
    household_estimated: householdEstimated,
    total_invested: mfTotal + (casTotal.invested || 0) + householdInvested,
    total_estimated: mfTotal + (casTotal.current || 0) + householdEstimated,
  })
})

export default router
