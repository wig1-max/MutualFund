// CAGR = (endValue / startValue)^(1/years) - 1
export function cagr(startNav, endNav, years) {
  if (startNav <= 0 || years <= 0) return null
  return (Math.pow(endNav / startNav, 1 / years) - 1) * 100
}

// Get NAV on or closest before a given date (binary search)
export function getNavOnDate(navData, targetDate) {
  if (!navData || navData.length === 0) return null

  let low = 0
  let high = navData.length - 1
  let result = null

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (navData[mid].date <= targetDate) {
      result = navData[mid]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

// Calculate returns for standard periods
export function calculateReturns(navData) {
  if (!navData || navData.length === 0) return {}

  const latest = navData[navData.length - 1]
  const latestDate = new Date(latest.date)
  const first = navData[0]

  const periods = {
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    '3Y': 365 * 3,
    '5Y': 365 * 5,
    '10Y': 365 * 10,
  }

  const results = {}

  for (const [label, days] of Object.entries(periods)) {
    const pastDate = new Date(latestDate)
    pastDate.setDate(pastDate.getDate() - days)
    const pastDateStr = pastDate.toISOString().split('T')[0]

    const pastNav = getNavOnDate(navData, pastDateStr)
    if (pastNav) {
      const years = days / 365

      // Use absolute return for sub-1Y, CAGR for 1Y+
      let returnValue
      if (days < 365) {
        returnValue = ((latest.nav - pastNav.nav) / pastNav.nav) * 100
      } else {
        returnValue = cagr(pastNav.nav, latest.nav, years)
      }

      results[label] = {
        return: returnValue,
        annualized: days >= 365,
        startNav: pastNav.nav,
        startDate: pastNav.date,
        endNav: latest.nav,
        endDate: latest.date,
      }
    }
  }

  // Since inception
  const totalYears = (latestDate - new Date(first.date)) / (365.25 * 24 * 60 * 60 * 1000)
  if (totalYears > 0) {
    results['SI'] = {
      return: cagr(first.nav, latest.nav, totalYears),
      startNav: first.nav,
      startDate: first.date,
      endNav: latest.nav,
      endDate: latest.date,
      years: totalYears,
    }
  }

  return results
}

// Rolling returns: Calculate 1Y returns for every possible 1Y window
export function rollingReturns(navData, windowYears = 1, periodYears = 5) {
  if (!navData || navData.length === 0) return []

  const latest = navData[navData.length - 1]
  const latestDate = new Date(latest.date)
  const periodStart = new Date(latestDate)
  periodStart.setFullYear(periodStart.getFullYear() - periodYears)
  const periodStartStr = periodStart.toISOString().split('T')[0]

  const windowDays = Math.round(windowYears * 365)
  const results = []

  // Build a date->nav map for faster lookups
  const navMap = new Map()
  for (const d of navData) {
    navMap.set(d.date, d.nav)
  }

  // Iterate through navData points within the period
  for (let i = 0; i < navData.length; i++) {
    const endPoint = navData[i]
    if (endPoint.date < periodStartStr) continue

    const endDate = new Date(endPoint.date)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - windowDays)
    const startDateStr = startDate.toISOString().split('T')[0]

    const startNav = getNavOnDate(navData, startDateStr)
    if (startNav) {
      const ret = cagr(startNav.nav, endPoint.nav, windowYears)
      if (ret !== null) {
        results.push({ date: endPoint.date, return: ret })
      }
    }
  }

  // Sample to ~200 points for performance
  if (results.length > 200) {
    const step = Math.floor(results.length / 200)
    const sampled = results.filter((_, i) => i % step === 0)
    // Always include the most recent data point
    if (sampled[sampled.length - 1] !== results[results.length - 1]) {
      sampled.push(results[results.length - 1])
    }
    return sampled
  }

  return results
}

// Standard deviation of returns (annualized)
export function standardDeviation(navData, periodYears = 3) {
  if (!navData || navData.length < 30) return null

  const latest = navData[navData.length - 1]
  const cutoff = new Date(latest.date)
  cutoff.setFullYear(cutoff.getFullYear() - periodYears)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const filtered = navData.filter(d => d.date >= cutoffStr)
  if (filtered.length < 20) return null

  // Calculate daily returns
  const dailyReturns = []
  for (let i = 1; i < filtered.length; i++) {
    dailyReturns.push((filtered[i].nav - filtered[i-1].nav) / filtered[i-1].nav)
  }

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1)
  const dailyStdDev = Math.sqrt(variance)

  // Annualize (252 trading days)
  return dailyStdDev * Math.sqrt(252) * 100
}

// Max drawdown
export function maxDrawdown(navData, periodYears = 3) {
  if (!navData || navData.length < 2) return null

  const latest = navData[navData.length - 1]
  const cutoff = new Date(latest.date)
  cutoff.setFullYear(cutoff.getFullYear() - periodYears)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const filtered = navData.filter(d => d.date >= cutoffStr)

  let peak = filtered[0].nav
  let maxDd = 0

  for (const d of filtered) {
    if (d.nav > peak) peak = d.nav
    const dd = (peak - d.nav) / peak
    if (dd > maxDd) maxDd = dd
  }

  return maxDd * 100
}

// Sharpe ratio
export function sharpeRatio(navData, riskFreeRate = 6, periodYears = 3) {
  const returns = calculateReturns(navData)
  const key = periodYears >= 5 ? '5Y' : periodYears >= 3 ? '3Y' : '1Y'
  const annualReturn = returns[key]?.return
  const stdDev = standardDeviation(navData, periodYears)

  if (annualReturn == null || stdDev == null || stdDev === 0) return null
  return (annualReturn - riskFreeRate) / stdDev
}

// XIRR calculation using Newton-Raphson
export function xirr(cashflows) {
  // cashflows: [{date: 'YYYY-MM-DD', amount: number}]
  // Negative amounts are investments, positive amounts are redemptions/current value
  if (!cashflows || cashflows.length < 2) return null

  // Guard: must have at least one positive and one negative cashflow
  const hasPositive = cashflows.some(cf => cf.amount > 0)
  const hasNegative = cashflows.some(cf => cf.amount < 0)
  if (!hasPositive || !hasNegative) return null

  const dates = cashflows.map(cf => new Date(cf.date).getTime())
  const amounts = cashflows.map(cf => cf.amount)
  const d0 = dates[0]

  function npv(rate) {
    let sum = 0
    for (let i = 0; i < amounts.length; i++) {
      const years = (dates[i] - d0) / (365.25 * 24 * 60 * 60 * 1000)
      sum += amounts[i] / Math.pow(1 + rate, years)
    }
    return sum
  }

  function dnpv(rate) {
    let sum = 0
    for (let i = 0; i < amounts.length; i++) {
      const years = (dates[i] - d0) / (365.25 * 24 * 60 * 60 * 1000)
      sum -= years * amounts[i] / Math.pow(1 + rate, years + 1)
    }
    return sum
  }

  let rate = 0.1
  for (let iter = 0; iter < 1000; iter++) {
    const f = npv(rate)
    const df = dnpv(rate)
    if (Math.abs(df) < 1e-12) break
    const newRate = rate - f / df
    if (Math.abs(newRate - rate) < 1e-9) return newRate * 100
    rate = newRate
    // Bound check
    if (rate < -0.99) rate = -0.99
    if (rate > 10) rate = 10
  }
  return rate * 100
}

// SIP Backtest
export function sipBacktest(navData, monthlySip, startDate, endDate = null) {
  if (!navData || navData.length === 0) return null

  const latest = navData[navData.length - 1]
  const end = endDate || latest.date

  let totalInvested = 0
  let totalUnits = 0
  const cashflows = []
  const timeline = []

  // Get first SIP date
  let currentDate = new Date(startDate)

  while (true) {
    const dateStr = currentDate.toISOString().split('T')[0]
    if (dateStr > end) break

    // Find NAV on this date (or closest available)
    const navEntry = getNavOnDate(navData, dateStr)
    if (navEntry) {
      const units = monthlySip / navEntry.nav
      totalUnits += units
      totalInvested += monthlySip
      cashflows.push({ date: navEntry.date, amount: -monthlySip })

      // Current value at this point
      const currentValue = totalUnits * navEntry.nav
      timeline.push({
        date: navEntry.date,
        invested: totalInvested,
        value: currentValue,
        nav: navEntry.nav,
        units: totalUnits,
      })
    }

    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  if (totalUnits === 0) return null

  const currentValue = totalUnits * latest.nav
  cashflows.push({ date: latest.date, amount: currentValue })

  const xirrValue = xirr(cashflows)

  return {
    totalInvested,
    currentValue,
    totalUnits,
    latestNav: latest.nav,
    latestDate: latest.date,
    xirr: xirrValue,
    absoluteReturn: ((currentValue - totalInvested) / totalInvested) * 100,
    timeline: timeline.length > 200
      ? timeline.filter((_, i) => i % Math.floor(timeline.length / 200) === 0).concat(timeline[timeline.length - 1])
      : timeline,
  }
}
