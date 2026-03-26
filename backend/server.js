import express from 'express'
import cors from 'cors'
import fundsRouter from './routes/funds.js'
import clientsRouter from './routes/clients.js'
import portfolioRouter from './routes/portfolio.js'
import backupRouter from './routes/backup.js'
import goalsRouter from './routes/goals.js'
import taxRouter from './routes/tax.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API routes
app.use('/api', fundsRouter)
app.use('/api', clientsRouter)
app.use('/api', portfolioRouter)
app.use('/api', backupRouter)
app.use('/api', goalsRouter)
app.use('/api', taxRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Tejova backend running on port ${PORT}`)
})
