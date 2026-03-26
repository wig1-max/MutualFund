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

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  pan_masked TEXT,
  risk_profile TEXT DEFAULT 'Moderate' CHECK(risk_profile IN ('Conservative', 'Moderate', 'Aggressive')),
  onboarding_date TEXT DEFAULT (date('now')),
  referred_by TEXT,
  tags TEXT DEFAULT '[]',
  review_frequency TEXT DEFAULT 'Quarterly' CHECK(review_frequency IN ('Monthly', 'Quarterly', 'Half-yearly', 'Annual')),
  next_review_date TEXT,
  notes_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_next_review ON clients(next_review_date);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);

CREATE TABLE IF NOT EXISTS client_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  scheme_code TEXT NOT NULL,
  scheme_name TEXT,
  invested_amount REAL NOT NULL DEFAULT 0,
  units REAL,
  purchase_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_holdings_client ON client_holdings(client_id);
CREATE INDEX IF NOT EXISTS idx_holdings_scheme ON client_holdings(scheme_code);

CREATE TABLE IF NOT EXISTS nav_cache (
  scheme_code TEXT NOT NULL,
  date TEXT NOT NULL,
  nav REAL NOT NULL,
  cached_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (scheme_code, date)
);
CREATE INDEX IF NOT EXISTS idx_nav_cache_code ON nav_cache(scheme_code);
