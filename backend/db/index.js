import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { migrations } from './migrations/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tejova.db')

let db

/**
 * Run all pending migrations in version order.
 * Migration files live in db/migrations/ and export:
 *   - version (number)  — unique, sequential
 *   - description (string)
 *   - up(db)  — synchronous function that applies the migration
 *
 * To add a new migration: create NNN_description.js and register it in
 * db/migrations/index.js.
 */
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT    NOT NULL,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  )

  for (const migration of migrations) {
    const { version, description, up } = migration
    if (applied.has(version)) continue

    console.log(`[DB] Applying migration ${version}: ${description}`)
    db.transaction(() => {
      up(db)
      db.prepare(
        'INSERT INTO schema_migrations (version, description) VALUES (?, ?)'
      ).run(version, description)
    })()
    console.log(`[DB] Migration ${version} applied.`)
  }
}

export function getDb() {
  if (!db) {
    // Create a daily pre-migration backup if the DB file already exists
    if (fs.existsSync(DB_PATH)) {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const datedBackup = DB_PATH.replace(/\.db$/, '') + `.backup-${today}.db`
        if (!fs.existsSync(datedBackup)) {
          fs.copyFileSync(DB_PATH, datedBackup)
          console.log(`[DB] Pre-migration backup saved: ${path.basename(datedBackup)}`)
        }
      } catch (e) {
        // Non-fatal — backup failure should not block startup
        console.warn('[DB] Could not create pre-migration backup:', e.message)
      }
    }

    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Apply base schema (idempotent CREATE TABLE IF NOT EXISTS)
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8')
    db.exec(schema)

    // Run versioned migrations (synchronous)
    try {
      runMigrations(db)
    } catch (e) {
      console.error('[DB] Migration failed:', e.message)
      process.exit(1)
    }
  }
  return db
}
