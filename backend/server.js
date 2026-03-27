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

// ---- Static file serving (production) ----

const distPath = path.join(__dirname, '..', 'frontend', 'dist')
app.use(express.static(distPath))

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Tejova backend running on port ${PORT}`)
})
