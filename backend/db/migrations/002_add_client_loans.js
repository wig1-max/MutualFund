/**
 * Migration 002 — Client loans
 *
 * Introduces a dedicated `client_loans` table to track liabilities
 * separately from assets. EMIs recorded here feed into the risk
 * profiler's capacity calculation (current_emi in client_profiles
 * becomes derived rather than manually entered).
 *
 * Columns:
 *   id                 — PK
 *   client_id          — FK to clients.id (cascade delete)
 *   loan_type          — enum-ish: home|car|personal|education|business|other
 *   lender             — e.g. "HDFC Bank"
 *   principal_amount   — original loan amount (₹)
 *   outstanding_amount — remaining principal (₹)
 *   emi_amount         — monthly EMI outflow (₹)
 *   interest_rate      — annualised %
 *   tenure_months      — total tenure in months
 *   remaining_months   — months left on the loan
 *   start_date         — loan start (ISO)
 *   end_date           — scheduled payoff (ISO)
 *   notes              — free text
 *   created_at / updated_at
 */
export const version = 2
export const description = 'Add client_loans table for EMI tracking'

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_loans (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id          INTEGER NOT NULL,
      loan_type          TEXT NOT NULL,
      lender             TEXT,
      principal_amount   REAL,
      outstanding_amount REAL,
      emi_amount         REAL NOT NULL DEFAULT 0,
      interest_rate      REAL,
      tenure_months      INTEGER,
      remaining_months   INTEGER,
      start_date         TEXT,
      end_date           TEXT,
      notes              TEXT,
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_client_loans_client ON client_loans(client_id)`)
}
