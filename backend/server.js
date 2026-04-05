import express from 'express'
import session from 'express-session'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fundsRouter from './routes/funds.js'
import clientsRouter from './routes/clients.js'
import portfolioRouter from './routes/portfolio.js'
import backupRouter from './routes/backup.js'
import goalsRouter from './routes/goals.js'
import taxRouter from './routes/tax.js'
import reportsRouter from './routes/reports.js'
import profilingRouter from './routes/profiling.js'
import scoringRouter from './routes/scoring.js'
import casRouter from './routes/cas.js'
import factsheetsRouter from './routes/factsheets.js'
import devlogRouter from './routes/devlog.js'
import assetsRouter from './routes/assets.js'
import wealthRouter from './routes/wealth.js'
import householdTaxRouter from './routes/householdTax.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'tejova-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.RAILWAY_ENVIRONMENT ? true : false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}))

// Trust Railway's proxy for secure cookies
if (process.env.RAILWAY_ENVIRONMENT) {
  app.set('trust proxy', 1)
}

// ---- Auth routes (unprotected) ----

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body
  const authPassword = process.env.AUTH_PASSWORD || 'tejova'

  if (password === authPassword) {
    req.session.authenticated = true
    return res.json({ success: true })
  }
  res.status(401).json({ message: 'Incorrect password' })
})

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated })
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true })
  })
})

// Health check (unprotected)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Dev log (unprotected — developer diagnostic tool)
app.use('/api', devlogRouter)

// ---- Auth middleware for all other API routes ----

app.use('/api', (req, res, next) => {
  if (req.session.authenticated) return next()
  res.status(401).json({ message: 'Authentication required' })
})

// API routes
app.use('/api', fundsRouter)
app.use('/api', clientsRouter)
app.use('/api', portfolioRouter)
app.use('/api', backupRouter)
app.use('/api', goalsRouter)
app.use('/api', taxRouter)
app.use('/api', reportsRouter)
app.use('/api', profilingRouter)
app.use('/api', scoringRouter)
app.use('/api', casRouter)
app.use('/api', factsheetsRouter)
app.use('/api', assetsRouter)
app.use('/api', wealthRouter)
app.use('/api', householdTaxRouter)

// ---- Static file serving (production) ----

const distPath = path.join(__dirname, '..', 'frontend', 'dist')
app.use(express.static(distPath))

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Tejova backend running on port ${PORT}`)

  setTimeout(async () => {
    try {
      const { getDb } = await import('./db/index.js')
      const db = getDb()

      // Check current metrics coverage
      const metricsCount = db.prepare(
        'SELECT COUNT(*) as c FROM fund_metrics ' +
        'WHERE sortino_ratio IS NOT NULL'
      ).get().c

      const navCacheCount = db.prepare(
        'SELECT COUNT(DISTINCT scheme_code) as c ' +
        'FROM nav_cache'
      ).get().c

      console.log(
        `[MetricsJob] Coverage check: ${metricsCount} funds ` +
        `have metrics, ${navCacheCount} funds in NAV cache.`
      )

      if (metricsCount < navCacheCount * 0.5) {
        // Less than 50% coverage — run the job
        console.log(
          '[MetricsJob] Coverage below 50% — starting ' +
          'background computation now...'
        )
        const { runMetricsJobBackground } = await import(
          './services/metricsJob.js'
        )
        await runMetricsJobBackground()
      } else {
        console.log(
          '[MetricsJob] Coverage sufficient — skipping startup job.'
        )
      }
    } catch (e) {
      console.error('[MetricsJob] Startup check failed:', e.message)
    }
  }, 3000)

  // Factsheet pipeline — auto-run if less than 5 AMCs extracted this month
  setTimeout(async () => {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('[FactsheetPipeline] No ANTHROPIC_API_KEY — skipping startup pipeline.')
        return
      }
      const { getDb } = await import('./db/index.js')
      const db = getDb()
      const currentMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 7) // Previous month (factsheets lag)
      const extracted = db.prepare(
        "SELECT COUNT(DISTINCT amc) as c FROM fund_factsheets WHERE factsheet_month = ?"
      ).get(currentMonth)?.c || 0
      if (extracted < 5) {
        console.log(`[FactsheetPipeline] Only ${extracted} AMCs extracted for ${currentMonth} — triggering pipeline...`)
        const { runFactsheetPipelineBackground } = await import('./services/factsheetPipeline.js')
        await runFactsheetPipelineBackground(currentMonth)
      } else {
        console.log(`[FactsheetPipeline] ${extracted} AMCs already extracted for ${currentMonth} — skipping.`)
      }
    } catch (e) {
      console.error('[FactsheetPipeline] Startup check failed:', e.message)
    }
  }, 60000)
})
