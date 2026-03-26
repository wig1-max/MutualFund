import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

router.get('/backup', (req, res) => {
  const dbPath = path.join(__dirname, '..', 'db', 'tejova.db')
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ message: 'Database file not found' })
  }

  const backupDir = path.join(__dirname, '..', 'backups')
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `tejova-${timestamp}.db`)
  fs.copyFileSync(dbPath, backupPath)

  res.download(backupPath, `tejova-backup-${timestamp}.db`)
})

export default router
