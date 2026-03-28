function normalSample() {
  let u1 = Math.random()
  while (u1 === 0) u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function sampleT(df) {
  const z = normalSample()
  let chiSum = 0
  for (let i = 0; i < df; i++) {
    const n = normalSample()
    chiSum += n * n
  }
  return z / Math.sqrt(chiSum / df)
}

export function runGoalSurvival({
  monthlyInvestment,
  currentSavings = 0,
  targetAmount,
  horizonYears,
  portfolioMeanReturn,
  portfolioStdDev,
  inflationRate = 0.06,
  numSimulations = 1000,
  stressScenarios = true,
}) {
  // Step 1 — Derive monthly parameters
  const monthlyMean = portfolioMeanReturn / 12
  const monthlyStdDev = portfolioStdDev / Math.sqrt(12)
  const horizonMonths = Math.round(horizonYears * 12)
  const inflatedTarget = targetAmount * Math.pow(1 + inflationRate, horizonYears)

  // Step 3 — Run base simulations
  const outcomes = []
  for (let sim = 0; sim < numSimulations; sim++) {
    let corpus = currentSavings
    for (let month = 0; month < horizonMonths; month++) {
      const t = sampleT(5)
      let monthlyReturn = monthlyMean + monthlyStdDev * t
      monthlyReturn = Math.max(-0.25, Math.min(0.30, monthlyReturn))
      corpus = corpus * (1 + monthlyReturn) + monthlyInvestment
    }
    outcomes.push(corpus)
  }

  // Step 4 — Calculate base statistics
  outcomes.sort((a, b) => a - b)
  const successCount = outcomes.filter(v => v >= inflatedTarget).length
  const baseProbability = Math.round(successCount / numSimulations * 100)
  const p5 = outcomes[Math.floor(numSimulations * 0.05)]
  const p50 = outcomes[Math.floor(numSimulations * 0.50)]
  const p95 = outcomes[Math.floor(numSimulations * 0.95)]

  // Step 5 — India stress scenarios
  let covidSurvivalRate = null
  let gfcSurvivalRate = null
  let stagnationSurvivalRate = null

  if (stressScenarios) {
    const stressSims = 200

    // Scenario A — COVID-style crash (month 6-7, -38% total)
    let covidSuccess = 0
    for (let sim = 0; sim < stressSims; sim++) {
      let corpus = currentSavings
      for (let month = 0; month < horizonMonths; month++) {
        let monthlyReturn
        if (month === 6 || month === 7) {
          monthlyReturn = -0.22
        } else {
          const t = sampleT(5)
          monthlyReturn = monthlyMean + monthlyStdDev * t
          monthlyReturn = Math.max(-0.25, Math.min(0.30, monthlyReturn))
        }
        corpus = corpus * (1 + monthlyReturn) + monthlyInvestment
      }
      if (corpus >= inflatedTarget) covidSuccess++
    }
    covidSurvivalRate = Math.round(covidSuccess / stressSims * 100)

    // Scenario B — GFC-style crash (months 12-23, -55% total)
    let gfcSuccess = 0
    for (let sim = 0; sim < stressSims; sim++) {
      let corpus = currentSavings
      for (let month = 0; month < horizonMonths; month++) {
        let monthlyReturn
        if (month >= 12 && month <= 23) {
          monthlyReturn = -0.065
        } else {
          const t = sampleT(5)
          monthlyReturn = monthlyMean + monthlyStdDev * t
          monthlyReturn = Math.max(-0.25, Math.min(0.30, monthlyReturn))
        }
        corpus = corpus * (1 + monthlyReturn) + monthlyInvestment
      }
      if (corpus >= inflatedTarget) gfcSuccess++
    }
    gfcSurvivalRate = Math.round(gfcSuccess / stressSims * 100)

    // Scenario C — Prolonged stagnation (returns halved for first 36 months)
    let stagSuccess = 0
    for (let sim = 0; sim < stressSims; sim++) {
      let corpus = currentSavings
      for (let month = 0; month < horizonMonths; month++) {
        const t = sampleT(5)
        const mean = month < 36 ? monthlyMean * 0.5 : monthlyMean
        let monthlyReturn = mean + monthlyStdDev * t
        monthlyReturn = Math.max(-0.25, Math.min(0.30, monthlyReturn))
        corpus = corpus * (1 + monthlyReturn) + monthlyInvestment
      }
      if (corpus >= inflatedTarget) stagSuccess++
    }
    stagnationSurvivalRate = Math.round(stagSuccess / stressSims * 100)
  }

  // Step 6 — Return result
  return {
    goalAmount: Math.round(inflatedTarget),
    baseProbability,
    outcomes: {
      worst: Math.round(p5),
      median: Math.round(p50),
      best: Math.round(p95),
    },
    stressTests: {
      covid2020: covidSurvivalRate,
      globalFinancialCrisis: gfcSurvivalRate,
      prolongedStagnation: stagnationSurvivalRate,
    },
    monthlyInvestment,
    horizonYears,
    inflationRate,
    simulationsRun: numSimulations + (stressScenarios ? 600 : 0),
  }
}
