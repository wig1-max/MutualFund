import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tejova.db')

let db

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
    db.exec(schema)

    // Migration: add new columns to fund_metrics if they don't exist
    const columns = db.prepare(
      "PRAGMA table_info(fund_metrics)"
    ).all().map(c => c.name)

    if (!columns.includes('sortino_ratio')) {
      db.exec("ALTER TABLE fund_metrics ADD COLUMN sortino_ratio REAL")
    }
    if (!columns.includes('calmar_ratio')) {
      db.exec("ALTER TABLE fund_metrics ADD COLUMN calmar_ratio REAL")
    }
    if (!columns.includes('jensen_alpha')) {
      db.exec("ALTER TABLE fund_metrics ADD COLUMN jensen_alpha REAL")
    }
    if (!columns.includes('data_quality_score')) {
      db.exec('ALTER TABLE fund_metrics ADD COLUMN data_quality_score REAL')
    }
    if (!columns.includes('age_years')) {
      db.exec('ALTER TABLE fund_metrics ADD COLUMN age_years REAL')
    }
    if (!columns.includes('nav_data_points')) {
      db.exec('ALTER TABLE fund_metrics ADD COLUMN nav_data_points INTEGER')
    }
  }
  return db
}
