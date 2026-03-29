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

CREATE TABLE IF NOT EXISTS client_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  goal_name TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'Custom',
  target_amount REAL NOT NULL,
  target_year INTEGER NOT NULL,
  current_savings REAL NOT NULL DEFAULT 0,
  expected_return REAL NOT NULL DEFAULT 12,
  inflation_rate REAL NOT NULL DEFAULT 6,
  monthly_sip REAL,
  priority TEXT DEFAULT 'Medium' CHECK(priority IN ('High', 'Medium', 'Low')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goals_client ON client_goals(client_id);

CREATE TABLE IF NOT EXISTS nav_cache (
  scheme_code TEXT NOT NULL,
  date TEXT NOT NULL,
  nav REAL NOT NULL,
  cached_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (scheme_code, date)
);
CREATE INDEX IF NOT EXISTS idx_nav_cache_code ON nav_cache(scheme_code);

-- Client financial profiles for risk assessment and recommendations
CREATE TABLE IF NOT EXISTS client_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL UNIQUE,
  monthly_income REAL,
  monthly_expenses REAL,
  monthly_emi REAL,
  income_type TEXT,
  tax_slab TEXT,
  age INTEGER,
  dependents INTEGER,
  has_home_loan INTEGER,
  has_emergency_fund INTEGER,
  emergency_fund_months REAL,
  investment_horizon TEXT,
  primary_goal TEXT,
  elss_invested_this_year REAL,
  existing_pf_balance REAL,
  investable_surplus REAL,
  risk_capacity_score REAL,
  risk_label TEXT,
  recommended_equity_pct REAL,
  recommended_debt_pct REAL,
  recommended_gold_pct REAL,
  questionnaire_responses TEXT,
  profile_complete INTEGER DEFAULT 0,
  last_scored_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_profiles_client ON client_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_client_profiles_risk ON client_profiles(risk_label);

-- CAS holdings imported from CAMS CAS statements
CREATE TABLE IF NOT EXISTS cas_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  folio_number TEXT,
  scheme_code TEXT,
  scheme_name TEXT,
  amc TEXT,
  isin TEXT,
  units REAL,
  nav REAL,
  current_value REAL,
  cost_value REAL,
  purchase_date TEXT,
  source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'cas_upload', 'cas_api')),
  fetched_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cas_holdings_client ON cas_holdings(client_id);
CREATE INDEX IF NOT EXISTS idx_cas_holdings_scheme ON cas_holdings(scheme_code);
CREATE INDEX IF NOT EXISTS idx_cas_holdings_folio ON cas_holdings(folio_number);

-- Fund recommendations from scoring engine
CREATE TABLE IF NOT EXISTS fund_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  scheme_code TEXT,
  scheme_name TEXT,
  category TEXT,
  amc TEXT,
  composite_score REAL,
  category_fit_score REAL,
  risk_alignment_score REAL,
  tax_efficiency_score REAL,
  overlap_penalty REAL,
  quality_score REAL,
  recommended_sip REAL,
  rank INTEGER,
  reasons TEXT,
  allocation_bucket TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fund_recs_client ON fund_recommendations(client_id);
CREATE INDEX IF NOT EXISTS idx_fund_recs_scheme ON fund_recommendations(scheme_code);
CREATE INDEX IF NOT EXISTS idx_fund_recs_category ON fund_recommendations(category);
CREATE INDEX IF NOT EXISTS idx_fund_recs_rank ON fund_recommendations(rank);

-- Pre-computed NAV-derived fund metrics cache
CREATE TABLE IF NOT EXISTS fund_metrics (
  scheme_code TEXT PRIMARY KEY,
  std_deviation REAL,
  max_drawdown REAL,
  sharpe_ratio REAL,
  sortino_ratio REAL,
  calmar_ratio REAL,
  jensen_alpha REAL,
  return_1y REAL,
  return_3y REAL,
  return_5y REAL,
  category_avg_1y REAL,
  category_avg_3y REAL,
  risk_level TEXT,
  metrics_date TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fund_metrics_risk ON fund_metrics(risk_level);

-- AMC factsheet extracted data
CREATE TABLE IF NOT EXISTS fund_factsheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_code TEXT,
  amc TEXT NOT NULL,
  fund_name_raw TEXT,
  factsheet_month TEXT,
  source_url TEXT,

  -- Extracted metrics
  expense_ratio REAL,
  aum_cr REAL,
  fund_manager TEXT,
  manager_tenure_years REAL,
  portfolio_turnover REAL,
  benchmark TEXT,
  exit_load TEXT,

  -- Portfolio characteristics
  top_holdings TEXT,
  sector_allocation TEXT,
  portfolio_pe REAL,
  portfolio_pb REAL,
  large_cap_pct REAL,
  mid_cap_pct REAL,
  small_cap_pct REAL,

  -- Strategy signals
  investment_style TEXT,
  investment_objective TEXT,

  -- Extraction metadata
  extraction_confidence TEXT DEFAULT 'medium',
  raw_extracted TEXT,
  extracted_at TEXT DEFAULT (datetime('now')),
  extraction_error TEXT,

  UNIQUE(amc, fund_name_raw, factsheet_month)
);

CREATE INDEX IF NOT EXISTS idx_factsheets_scheme ON fund_factsheets(scheme_code);
CREATE INDEX IF NOT EXISTS idx_factsheets_amc_month ON fund_factsheets(amc, factsheet_month);

CREATE TABLE IF NOT EXISTS amc_factsheet_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amc_name TEXT NOT NULL UNIQUE,
  amc_slug TEXT NOT NULL,
  factsheet_url_template TEXT,
  factsheet_page_url TEXT,
  fetch_method TEXT DEFAULT 'direct',
  last_fetched TEXT,
  last_fetch_status TEXT,
  funds_extracted INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
