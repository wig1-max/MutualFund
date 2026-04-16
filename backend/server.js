import express from 'express'
import session from 'express-session'
import SqliteStoreFactory from 'better-sqlite3-session-store'
import rateLimit from 'express-rate-limit'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from './db/index.js'
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
import loansRouter from './routes/loans.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// ---- 1G: Enforce credential env vars ----
// In production, refuse to start with insecure defaults
if (process.env.NODE_ENV === 'production') {
  if (!process.env.AUTH_PASSWORD) {
    console.error('[FATAL] AUTH_PASSWORD env var is not set in production. Refusing to start.')
    process.exit(1)
  }
  if (!process.env.SESSION_SECRET) {
    console.error('[FATAL] SESSION_SECRET env var is not set in production. Refusing to start.')
    process.exit(1)
  }
} else {
  if (!process.env.AUTH_PASSWORD) {
    console.warn('[WARN] AUTH_PASSWORD not set — using insecure default "tejova". Do not use in production.')
  }
  if (!process.env.SESSION_SECRET) {
    console.warn('[WARN] SESSION_SECRET not set — using insecure default. Do not use in production.')
  }
}

// ---- 1A: CORS — explicit allowlist for /api routes only ----
// Static assets are served from the same origin as the HTML, so they don't
// need CORS headers. Applying cors() globally was blocking the browser's
// crossorigin fetch of /assets/*.js and /assets/*.css (Vite adds the
// crossorigin attribute, causing Chrome to include an Origin header even for
// same-origin asset requests, which the strict allowlist was rejecting → 500).
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean)

const corsMiddleware = cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no Origin header) and explicitly listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origin not allowed'))
  },
  credentials: true,
})

// Apply CORS only to API routes, not to static file serving
app.use('/api', corsMiddleware)

app.use(express.json())

// Trust Railway's proxy for secure cookies
if (process.env.RAILWAY_ENVIRONMENT) {
  app.set('trust proxy', 1)
}

// ---- 1C: Persist sessions to SQLite ----
const SqliteStore = SqliteStoreFactory(session)

app.use(session({
  store: new SqliteStore({ client: getDb() }),
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

// ---- 1D: Rate limit the login endpoint ----
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts — try again in 15 minutes.' },
})

// ---- Auth routes (unprotected) ----

app.post('/api/auth/login', loginLimiter, (req, res) => {
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

// ---- Auth middleware for all API routes ----

app.use('/api', (req, res, next) => {
  if (req.session.authenticated) return next()
  res.status(401).json({ message: 'Authentication required' })
})

// API routes (all protected — including devlog: 1B fix)
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
app.use('/api', loansRouter)
app.use('/api', devlogRouter)

// ---- Static file serving (production) ----

const distPath = path.join(__dirname, '..', 'frontend', 'dist')
app.use(express.static(distPath))

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// ---- 2F: Global error handler ----
// Catches sync throws from route handlers. ValidationError (from
// utils/validate.js) surfaces as 400. Anything else becomes a 500
// with a generic message — the actual error is logged server-side.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.name === 'ValidationError') {
    return res.status(err.status || 400).json({
      message: err.message,
      field:   err.field || null,
    })
  }
  console.error('[UnhandledError]', req.method, req.path, '-', err?.message || err)
  if (err?.stack) console.error(err.stack)
  res.status(500).json({ message: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Tejova backend running on port ${PORT}`)

  setTimeout(async () => {
    try {
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
