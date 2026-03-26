CREATE TABLE IF NOT EXISTS funds (
  scheme_code TEXT PRIMARY KEY,
  isin_growth TEXT,
  isin_reinvest TEXT,
  scheme_name TEXT NOT NULL,
  nav REAL,
  nav_date TEXT,
  scheme_type TEXT,
  scheme_category TEXT,
  amc TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_funds_name ON funds(scheme_name);
CREATE INDEX IF NOT EXISTS idx_funds_category ON funds(scheme_category);
CREATE INDEX IF NOT EXISTS idx_funds_amc ON funds(amc);
