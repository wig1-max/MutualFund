import express from 'express'
import cors from 'cors'
import fundsRouter from './routes/funds.js'
import clientsRouter from './routes/clients.js'
import portfolioRouter from './routes/portfolio.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API routes
app.use('/api', fundsRouter)
app.use('/api', clientsRouter)
app.use('/api', portfolioRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Tejova backend running on port ${PORT}`)
})
