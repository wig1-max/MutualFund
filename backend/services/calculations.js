// Risk-free rate (annualised %) — based on 10-year G-sec yield.
// Review annually each April after the RBI MPC meeting.
// Last updated: April 2025 (10Y G-sec ~7.0%)
export const RISK_FREE_RATE_PCT = 7.0

// CAGR = (endValue / startValue)^(1/years) - 1
export function cagr(startNav, endNav, years) {
  if (startNav <= 0 || years <= 0) return null
  return (Math.pow(endNav / startNav, 1 / years) - 1) * 100
}

// Get NAV on or closest before a given date (binary search)
// Requires navData sorted ascending by date (as provided by mfapi.js)
export function getNavOnDate(navData, targetDate) {
  if (!navData || navData.length === 0) return null
  if (navData.length > 1 && navData[0].date > navData[navData.length - 1].date) {
    console.warn('getNavOnDate: navData is not sorted ascending by date — results may be incorrect')
  }

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
export function sharpeRatio(navData, riskFreeRate = RISK_FREE_RATE_PCT, periodYears = 3) {
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

  // Use fixed base date to avoid month-skipping when dates have 31 days
  const baseDate = new Date(startDate)

  for (let monthOffset = 0; ; monthOffset++) {
    const sipDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, Math.min(baseDate.getDate(), 28))
    const dateStr = sipDate.toISOString().split('T')[0]
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

// Sortino ratio — like Sharpe but penalises only downside volatility
export function sortinoRatio(navData, riskFreeRate = RISK_FREE_RATE_PCT, periodYears = 3) {
  if (!navData || navData.length === 0) return null

  const latest = navData[navData.length - 1]
  const cutoff = new Date(latest.date)
  cutoff.setFullYear(cutoff.getFullYear() - periodYears)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const filtered = navData.filter(d => d.date >= cutoffStr)
  if (filtered.length < 20) return null

  const dailyReturns = []
  for (let i = 1; i < filtered.length; i++) {
    dailyReturns.push(
      (filtered[i].nav - filtered[i - 1].nav) / filtered[i - 1].nav
    )
  }

  // Daily MAR = annualised risk-free rate converted to daily
  const dailyMar = riskFreeRate / 100 / 252

  // Downside deviation: penalise returns BELOW MAR (not below zero)
  // Divide by TOTAL days — not just days with shortfalls
  const downsideSquaredSum = dailyReturns.reduce((s, r) => {
    const shortfall = Math.min(0, r - dailyMar)
    return s + shortfall * shortfall
  }, 0)

  const downsideDev = Math.sqrt(downsideSquaredSum / dailyReturns.length)
  if (downsideDev === 0) return null

  const annualisedDownsideDev = downsideDev * Math.sqrt(252)

  const returns = calculateReturns(navData)
  const key = periodYears >= 5 ? '5Y' : periodYears >= 3 ? '3Y' : '1Y'
  const annualisedReturn = returns[key]?.return
  if (annualisedReturn == null) return null

  return (annualisedReturn - riskFreeRate) / (annualisedDownsideDev * 100)
}

// Calmar ratio — annualised return / max drawdown
export function calmarRatio(navData, periodYears = 3) {
  const returns = calculateReturns(navData)
  const key = periodYears >= 5 ? '5Y' : periodYears >= 3 ? '3Y' : '1Y'
  const annualisedReturn = returns[key]?.return
  const md = maxDrawdown(navData, periodYears)

  if (annualisedReturn == null || md == null || md === 0) return null
  return annualisedReturn / md
}

// Jensen's alpha — excess return above CAPM prediction
export function jensensAlpha(navData, benchmarkNavData, riskFreeRate = RISK_FREE_RATE_PCT, periodYears = 3) {
  if (!navData || !benchmarkNavData || navData.length === 0 || benchmarkNavData.length === 0) return null

  const latest = navData[navData.length - 1]
  const cutoff = new Date(latest.date)
  cutoff.setFullYear(cutoff.getFullYear() - periodYears)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const filtered = navData.filter(d => d.date >= cutoffStr)
  if (filtered.length < 20) return null

  // Match fund dates to benchmark
  const matched = []
  for (let i = 1; i < filtered.length; i++) {
    const prevBench = getNavOnDate(benchmarkNavData, filtered[i - 1].date)
    const currBench = getNavOnDate(benchmarkNavData, filtered[i].date)
    if (prevBench && currBench && prevBench.nav > 0 && filtered[i - 1].nav > 0) {
      matched.push({
        fundReturn: (filtered[i].nav - filtered[i - 1].nav) / filtered[i - 1].nav,
        benchReturn: (currBench.nav - prevBench.nav) / prevBench.nav,
      })
    }
  }

  if (matched.length < 20) return null

  const fundMean = matched.reduce((s, m) => s + m.fundReturn, 0) / matched.length
  const benchMean = matched.reduce((s, m) => s + m.benchReturn, 0) / matched.length

  let covariance = 0
  let benchVariance = 0
  for (const m of matched) {
    covariance += (m.fundReturn - fundMean) * (m.benchReturn - benchMean)
    benchVariance += (m.benchReturn - benchMean) ** 2
  }
  covariance /= matched.length
  benchVariance /= matched.length

  if (benchVariance < 1e-12) return null
  const beta = covariance / benchVariance

  // Annualised returns
  const fundReturns = calculateReturns(navData)
  const key = periodYears >= 5 ? '5Y' : periodYears >= 3 ? '3Y' : '1Y'
  const annualisedFundReturn = fundReturns[key]?.return
  if (annualisedFundReturn == null) return null

  const benchFirst = getNavOnDate(benchmarkNavData, cutoffStr)
  const benchLast = benchmarkNavData[benchmarkNavData.length - 1]
  if (!benchFirst || !benchLast || benchFirst.nav <= 0) return null
  const annualisedBenchReturn = cagr(benchFirst.nav, benchLast.nav, periodYears)
  if (annualisedBenchReturn == null) return null

  const annualisedRf = riskFreeRate
  const alpha = annualisedFundReturn - (annualisedRf + beta * (annualisedBenchReturn - annualisedRf))

  return { alpha, beta }
}

// Portfolio standard deviation — weighted across multiple funds
export function portfolioStdDev(navDataMap, weights) {
  const schemeCodes = Object.keys(weights)
  if (schemeCodes.length === 0) return null

  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 3)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Calculate daily returns for each fund, keyed by date
  const returnsByDate = {}
  for (const code of schemeCodes) {
    const navData = navDataMap[code]
    if (!navData || navData.length < 30) return null

    const filtered = navData.filter(d => d.date >= cutoffStr)
    for (let i = 1; i < filtered.length; i++) {
      const date = filtered[i].date
      const ret = (filtered[i].nav - filtered[i - 1].nav) / filtered[i - 1].nav
      if (!returnsByDate[date]) returnsByDate[date] = {}
      returnsByDate[date][code] = ret
    }
  }

  // Find common dates where all funds have returns
  const commonDates = Object.keys(returnsByDate).filter(
    date => schemeCodes.every(code => returnsByDate[date][code] !== undefined)
  )

  if (commonDates.length < 30) return null

  // Weighted portfolio returns
  const portfolioReturns = commonDates.map(date => {
    let wr = 0
    for (const code of schemeCodes) {
      wr += weights[code] * returnsByDate[date][code]
    }
    return wr
  })

  const mean = portfolioReturns.reduce((s, r) => s + r, 0) / portfolioReturns.length
  const variance = portfolioReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (portfolioReturns.length - 1)
  const dailyStdDev = Math.sqrt(variance)

  return dailyStdDev * Math.sqrt(252) * 100
}

// Fund age in years from NAV history
export function fundAgeYears(navData) {
  if (!navData || navData.length === 0) return 0
  const firstDate = new Date(navData[0].date)
  const lastDate = new Date(navData[navData.length - 1].date)
  return (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000)
}
