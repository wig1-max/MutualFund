import { Router } from 'express'
import { getDb } from '../db/index.js'
import { estimateCurrentValue } from '../services/assetValuation.js'
import { getTaxClass, getAssetTypeLabel } from '../utils/assetClassification.js'
import { computeAssetTax, getAllTaxRules } from '../services/taxRulesRegistry.js'

const router = Router()

// GET /api/tax/rules — return all tax rules for display
router.get('/tax/rules', (req, res) => {
  try {
    const rules = getAllTaxRules()
    res.json(rules)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET /api/tax/:clientId/household — household asset tax analysis
router.get('/tax/:clientId/household', (req, res) => {
  try {
    const { clientId } = req.params
    const slabRate = parseFloat(req.query.slab_rate) || 0.30

    const db = getDb()

    // Verify client exists
    const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId)
    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    // Get all household assets for this client
    const assets = db.prepare(
      'SELECT * FROM household_assets WHERE client_id = ? ORDER BY asset_type, name'
    ).all(clientId)

    // Analyze each asset
    const analyzed = assets.map(asset => {
      const estimatedValue = estimateCurrentValue(asset)
      const taxResult = computeAssetTax(
        { ...asset, estimated_value: estimatedValue },
        slabRate
      )

      return {
        id: asset.id,
        name: asset.name,
        asset_type: asset.asset_type,
        asset_type_label: getAssetTypeLabel(asset.asset_type),
        asset_subtype: asset.asset_subtype,
        invested_amount: asset.invested_amount || 0,
        estimated_value: estimatedValue,
        purchase_date: asset.purchase_date,
        maturity_date: asset.maturity_date,
        ...taxResult,
      }
    })

    // Build summary
    let totalInvested = 0
    let totalEstimatedValue = 0
    let totalGain = 0
    let totalEstimatedTax = 0
    const byTaxClass = {}
    const harvestingOpportunities = []

    for (const a of analyzed) {
      totalInvested += a.invested_amount
      totalEstimatedValue += a.estimated_value
      totalGain += a.gain
      totalEstimatedTax += a.estimatedTax

      // Group by taxClass
      if (!byTaxClass[a.taxClass]) {
        byTaxClass[a.taxClass] = {
          label: a.rule.label,
          totalGain: 0,
          totalTax: 0,
          count: 0,
        }
      }
      byTaxClass[a.taxClass].totalGain += a.gain
      byTaxClass[a.taxClass].totalTax += a.estimatedTax
      byTaxClass[a.taxClass].count += 1

      // Harvesting opportunities: assets with unrealized losses
      if (a.gain < 0 && a.taxClass !== 'exempt') {
        const potentialRate = a.isLongTerm
          ? (a.rule.ltcgRate || slabRate)
          : (a.rule.stcgRate || slabRate)
        harvestingOpportunities.push({
          id: a.id,
          name: a.name,
          asset_type: a.asset_type,
          asset_type_label: a.asset_type_label,
          loss: Math.abs(a.gain),
          holdingMonths: a.holdingMonths,
          gainType: a.gainType,
          potentialTaxSaved: Math.abs(a.gain) * potentialRate,
        })
      }
    }

    res.json({
      client,
      assets: analyzed,
      summary: {
        totalInvested,
        totalEstimatedValue,
        totalGain,
        totalEstimatedTax,
        assetCount: analyzed.length,
        byTaxClass,
      },
      harvestingOpportunities,
      slabRate,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
