/**
 * Migration 001 — Baseline
 *
 * Records all columns that were added via ad-hoc ALTER TABLE in the original
 * db/index.js getDb() function. These columns already exist in any database
 * that has been used — this migration is a no-op SQL-wise, it simply
 * marks the baseline as applied so the migration runner has a known starting
 * point.
 *
 * Going forward, every new schema change gets its own migration file:
 *   002_add_client_loans.js
 *   003_add_family_members.js
 *   etc.
 */
export const version = 1
export const description = 'Baseline — existing ad-hoc migrations absorbed'

export function up(db) {
  // fund_metrics extra columns (added in original getDb())
  const fmCols = db.prepare('PRAGMA table_info(fund_metrics)').all().map(c => c.name)
  const fmNeeded = [
    ['sortino_ratio', 'REAL'],
    ['calmar_ratio', 'REAL'],
    ['jensen_alpha', 'REAL'],
    ['data_quality_score', 'REAL'],
    ['age_years', 'REAL'],
    ['nav_data_points', 'INTEGER'],
    ['expense_ratio', 'REAL'],
    ['aum_cr', 'REAL'],
    ['manager_tenure_years', 'REAL'],
    ['portfolio_pe', 'REAL'],
  ]
  for (const [col, type] of fmNeeded) {
    if (!fmCols.includes(col)) {
      db.exec(`ALTER TABLE fund_metrics ADD COLUMN ${col} ${type}`)
    }
  }

  // client_profiles extra columns (added in original getDb())
  const cpCols = db.prepare('PRAGMA table_info(client_profiles)').all().map(c => c.name)
  const cpNeeded = [
    ['risk_tolerance_score', 'REAL'],
    ['risk_effective_score', 'REAL'],
  ]
  for (const [col, type] of cpNeeded) {
    if (!cpCols.includes(col)) {
      db.exec(`ALTER TABLE client_profiles ADD COLUMN ${col} ${type}`)
    }
  }
}
