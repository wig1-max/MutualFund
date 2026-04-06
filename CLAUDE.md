# TEJOVA MFD OPS TOOLKIT

Internal operations toolkit for Tejova, a mutual fund distribution practice based in Panchkula, Haryana.

## Project Structure

```
MutualFund/
├── backend/                    # Node.js Express API (port 3001)
│   ├── server.js               # Entry point, auth middleware, mounts all routers under /api
│   ├── db/
│   │   ├── index.js            # SQLite (better-sqlite3) singleton with WAL mode
│   │   ├── schema.sql          # 13 tables (see Database Schema below)
│   │   └── tejova.db           # SQLite database file (gitignored)
│   ├── routes/
│   │   ├── funds.js            # Fund search, NAV, returns, SIP backtest, category heatmap
│   │   ├── clients.js          # Client CRUD, notes, review scheduling, tags
│   │   ├── portfolio.js        # Holdings CRUD, portfolio analysis (allocation, overlap, underperformers)
│   │   ├── goals.js            # Goal CRUD, SIP calculator, projections, asset allocation endpoints
│   │   ├── tax.js              # Tax analysis (Budget 2024 rules), harvesting opportunities
│   │   ├── reports.js          # AI report generation via Claude API
│   │   ├── backup.js           # Database backup download
│   │   ├── profiling.js        # Risk profiling stats, get/update client profiles
│   │   ├── scoring.js          # Fund metrics computation, scoring by risk/quality
│   │   ├── cas.js              # CAS text parsing, import, holdings retrieval
│   │   ├── factsheets.js       # AMC factsheet pipeline triggers (fetch/extract/store)
│   │   ├── devlog.js           # Database stats, metrics coverage, diagnostic info
│   │   ├── assets.js           # Household assets CRUD (non-MF: stocks, FDs, insurance, etc.)
│   │   ├── wealth.js           # Aggregated wealth summary (MF + household assets)
│   │   └── householdTax.js     # Household asset tax analysis, tax rules endpoint
│   ├── services/
│   │   ├── mfapi.js            # mfapi.in API wrapper (NAV history, latest NAV)
│   │   ├── amfi.js             # AMFI NAV feed sync (bulk fund data)
│   │   ├── calculations.js     # CAGR, returns, Sharpe, Sortino, Calmar, alpha, drawdown
│   │   ├── navCache.js         # SQLite-backed NAV cache with 24h TTL, batch prefetch
│   │   ├── scoringEngine.js    # Fund scoring engine (945 lines) — slot-based recommendations
│   │   ├── profileAnalyzer.js  # Risk capacity/tolerance scoring, asset allocation recommendations
│   │   ├── casParser.js        # CAMS/KFintech CAS text parser (regex-based)
│   │   ├── metricsJob.js       # Background job: computes fund metrics for 250+ NAV data points
│   │   ├── factsheetPipeline.js # Orchestrates AMC factsheet fetch → extract → store
│   │   ├── factsheetExtractor.js # Claude API-based PDF extraction of fund data
│   │   ├── pdfFetcher.js       # PDF download (20MB limit) + AMC website link scraping
│   │   ├── monteCarloEngine.js # Goal survival simulations (t-distribution, stress scenarios)
│   │   ├── goalAllocationEngine.js # Goal-to-asset-allocation mapping (horizon, risk, tax optimization)
│   │   ├── amcRegistry.js      # URLs and metadata for 15+ Indian AMCs
│   │   ├── assetValuation.js   # Current-value estimation for non-MF assets (FD, PPF, SGB, etc.)
│   │   └── taxRulesRegistry.js # Tax rules per asset class (Budget 2024), computeAssetTax()
│   ├── utils/
│   │   ├── fundClassification.js # isEquityFund, getCategoryRiskLevel, getAllocationBucket, getBenchmarkSchemeCode
│   │   └── assetClassification.js # Asset type taxonomy, tax/liquidity classification, wealth buckets
│   └── data/
│       └── fund-holdings.json  # Static fund holdings data for overlap analysis
├── frontend/                   # React (Vite) + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx             # ErrorBoundary > ToastProvider > AuthProvider > BrowserRouter > ClientProvider > Routes
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Tailwind imports + custom animations
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx           # Password-based auth screen
│   │   │   ├── Dashboard.jsx           # Module 0: AUM, market pulse, quick actions, profiling summary
│   │   │   ├── FundIntelligence.jsx    # Module 1: Fund search, compare, SIP backtest, categories
│   │   │   ├── ClientCRM.jsx           # Module 2: Client database, notes, reviews, tags
│   │   │   ├── ClientProfile.jsx       # Module 2b: 5-step risk profiling wizard
│   │   │   ├── PortfolioXray.jsx       # Module 3: Portfolio analysis, allocation, overlap + wealth tab
│   │   │   ├── WealthView.jsx          # Module 3b: Unified household wealth view (MF + non-MF assets)
│   │   │   ├── GoalPlanner.jsx         # Module 4: Life goals, SIP planning, projections, asset allocation
│   │   │   ├── TaxOptimizer.jsx        # Module 5: MF tax + household asset tax (tabbed), harvesting, estimator
│   │   │   ├── ReportGenerator.jsx     # Module 6: AI-powered branded PDF reports
│   │   │   ├── Recommendations.jsx     # Module 7: Fund scoring results + SIP allocation
│   │   │   └── DevLog.jsx              # System health: DB stats, API status, metrics coverage
│   │   ├── components/
│   │   │   ├── Sidebar.jsx       # Responsive nav (desktop collapsible + mobile hamburger + logout)
│   │   │   ├── Toast.jsx         # Toast notification context + provider
│   │   │   ├── ErrorBoundary.jsx # React error boundary with reload
│   │   │   ├── FundSearch.jsx    # Reusable fund search dropdown with debounce
│   │   │   └── UI.jsx            # Shared primitives: Card, GlassCard, Stat, Badge, Button, Input, Select, Modal
│   │   ├── contexts/
│   │   │   ├── ClientContext.jsx # Shared client state across pages
│   │   │   └── AuthContext.jsx   # Login/logout, session checking, auth state
│   │   ├── services/
│   │   │   └── api.js           # 70+ API call functions (funds, clients, portfolio, goals, tax, reports, profiling, scoring, CAS, assets, wealth)
│   │   ├── hooks/
│   │   │   └── useFundSearch.js # Debounced fund search hook (300ms)
│   │   └── lib/
│   │       └── utils.js         # cn(), formatCurrency() (Cr/L notation), formatPercent(), formatDate()
│   └── vite.config.js          # Vite config with /api proxy to localhost:3001, '@' path alias
```

## Tech Stack

- **Frontend**: React 19 (Vite 8) + Tailwind CSS 4 + Recharts 3 + Lucide React icons
- **Backend**: Node.js + Express 4 (ES modules) with session-based auth
- **Database**: SQLite via better-sqlite3 (WAL mode, foreign keys enabled)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) for report generation + factsheet PDF extraction
- **Data Sources**: mfapi.in (NAV history), AMFI NAV feed (bulk fund data), AMC factsheet PDFs (15+ AMCs)
- **Routing**: react-router-dom v7

## Brand Colors

- Navy: `#1B2A4A` (primary text, headers, sidebar)
- Gold: `#D4A847` (accents, active states, branding)
- Background: `#f8f9fc`

## Commands

```bash
# Backend
cd backend && npm install
ANTHROPIC_API_KEY=sk-ant-... node server.js    # Start on port 3001

# Frontend
cd frontend && npm install
npx vite             # Dev server (proxies /api to :3001)
npx vite build       # Production build to dist/

# Both (development)
# Terminal 1: cd backend && npm run dev
# Terminal 2: cd frontend && npm run dev
```

## Environment Variables

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `PORT` | Backend port | 3001 | No |
| `ANTHROPIC_API_KEY` | Claude API for reports + factsheet extraction | — | Yes (for AI features) |
| `AUTH_PASSWORD` | Login password | 'tejova' | No (set in prod) |
| `SESSION_SECRET` | Express session encryption | 'tejova-dev-secret-change-in-prod' | No (set in prod) |
| `DB_PATH` | SQLite database file path | `./backend/db/tejova.db` | No |
| `NODE_ENV` | Production/development flag | — | No |
| `RAILWAY_ENVIRONMENT` | Railway.app deployment (enables secure cookies, trust proxy) | — | No |

## Key Architecture Decisions

- **No ORM**: Direct SQL via better-sqlite3 prepared statements (synchronous API)
- **Session Auth**: Password-based login with express-session; all routes except `/auth/*`, `/health`, `/dev/status` require `session.authenticated`
- **NAV Cache**: `nav_cache` SQLite table with 24h TTL avoids repeated mfapi.in hits; `batchPrefetchNavs()` fetches multiple schemes in parallel
- **SIP Date Handling**: Fixed base date + monthOffset approach (not Date.setMonth) to avoid date drift; day clamped to 28 max
- **Tax Rules**: Budget 2024 rates — Equity STCG 20%, LTCG 12.5% (exempt up to 1.25L), Debt at 30% slab. `taxRulesRegistry.js` extends this to all household asset types (real estate, gold, NPS, insurance, PPF/EPF, SGB) with per-taxClass rules
- **Fund Classification**: `fundClassification.js` — `isEquityFund()`, `getCategoryRiskLevel()`, `getAllocationBucket()` all use AMFI category keywords
- **Scoring Engine**: Slot-based fund recommendations (ELSS, Large Cap, Flexi Cap, Mid Cap, Small Cap, Index, Multi Cap, etc.) with hard filters (Sharpe, alpha, drawdown) and composite scoring
- **Risk Profiling**: 5-step questionnaire → risk capacity + tolerance scores → effective score → equity/debt/gold allocation %
- **Factsheet Pipeline**: Background job scrapes AMC websites → fetches PDFs → Claude API extracts structured data → stored in `fund_factsheets`
- **Scheme Code Validation**: `/^\d{4,6}$/` regex on all fund code endpoints
- **Print-to-PDF**: Reports open a styled print window rather than server-side PDF generation
- **Component Hierarchy**: `ErrorBoundary > ToastProvider > AuthProvider > BrowserRouter > ClientProvider > Routes`
- **Background Startup Jobs**: Metrics computation (3s delay, if coverage < 50%) and factsheet pipeline (60s delay, if < 5 AMCs extracted)
- **SPA Fallback**: Non-API routes serve `frontend/dist/index.html` for client-side routing
- **Multi-Asset Foundation**: `household_assets` table stores non-MF assets (stocks, FDs, insurance, real estate, PF/PPF, NPS, gold, EPF). MF holdings remain in `client_holdings`/`cas_holdings`. Wealth summary aggregates both layers.
- **Goal Allocation Engine**: `goalAllocationEngine.js` maps goals to multi-asset allocations (equity MF, debt MF, stocks, FD, gold, PPF, NPS, ELSS) based on time horizon (<3y debt-heavy, 3-7y balanced, >7y equity-heavy), client risk profile, and tax optimization (NPS for retirement, ELSS/PPF for tax saving). Custom allocations stored as JSON in `client_goals.asset_allocation`
- **MF-Specialist Scope**: Scoring engine, fund metrics, calculations, CAS import, factsheet pipeline, and fund classification remain MF-only. Non-MF assets use simpler valuation (assetValuation.js) and manual entry

## Database Schema (SQLite)

13 tables in `backend/db/schema.sql`. Schema auto-creates on first connection. DB file: `backend/db/tejova.db`. Backup: `GET /api/backup`.

| Table | Purpose |
|-------|---------|
| `funds` | Master fund data from AMFI (scheme_code PK, name, NAV, category, AMC) |
| `clients` | Client records (name, phone, email, PAN, risk_profile, review scheduling, tags) |
| `client_notes` | Per-client notes (FK → clients) |
| `client_holdings` | Manual MF holdings (scheme_code, invested_amount, units, purchase_date; FK → clients, funds) |
| `client_goals` | Investment goals (target_amount, target_year, monthly_sip, expected_return, asset_allocation JSON; FK → clients) |
| `nav_cache` | NAV history cache with 24h TTL (scheme_code + date composite PK) |
| `client_profiles` | Risk profiling data: income, expenses, questionnaire responses, capacity/tolerance/effective scores, recommended equity/debt/gold % (FK → clients) |
| `cas_holdings` | CAS-imported holdings with source enum (manual/cas_upload/cas_api), folio, ISIN, units, NAV (FK → clients) |
| `fund_recommendations` | Scored fund picks per client: composite_score, category_fit, risk_alignment, tax_efficiency, overlap_penalty, recommended_sip (FK → clients) |
| `fund_metrics` | Computed metrics per fund: std_deviation, max_drawdown, Sharpe/Sortino/Calmar ratios, alpha, 1Y/3Y/5Y returns, data quality score (PK: scheme_code) |
| `fund_factsheets` | Extracted factsheet data: expense_ratio, AUM, manager, top holdings, sector allocation, PE/PB, cap split, investment style |
| `amc_factsheet_sources` | AMC registry for factsheet scraping: URL templates, fetch method, last status, active flag |
| `household_assets` | Non-MF assets (stocks, FDs, insurance, real estate, PF/PPF, NPS, gold, EPF, other); asset_type enum, metadata JSON, interest_rate, maturity_date (FK → clients) |

## API Routes

All routes prefixed with `/api`. Auth required unless noted.

| Route | Module | Description |
|-------|--------|-------------|
| `/auth/*` | Auth | Login, session check, logout (no auth required) |
| `/health` | Health | Health check (no auth required) |
| `/dev/status` | DevLog | Database diagnostics (no auth required) |
| `/funds/*` | Fund Intelligence | AMFI sync, search, NAV history, returns, SIP backtest, categories, heatmap |
| `/clients/*` | Client CRM | CRUD, notes, review scheduling, tags, stats |
| `/portfolio/*` | Portfolio X-Ray | Holdings CRUD, analysis (allocation, overlap, underperformers, correlation) |
| `/goals/*` | Goal Planner | Goal CRUD, SIP calculator, summary, asset allocation (GET/POST per goal) |
| `/tax/*` | Tax Optimizer | MF tax analysis, harvesting opportunities, standalone estimator, household asset tax analysis, tax rules |
| `/reports/*` | Report Generator | AI report generation (requires ANTHROPIC_API_KEY) |
| `/profiling/*` | Risk Profiling | Aggregate stats, get/update client profiles with questionnaire |
| `/scoring/*` | Fund Scoring | Compute fund metrics, check job progress, score funds for client |
| `/cas/*` | CAS Import | Parse CAS text, import to holdings, retrieve, clear |
| `/factsheets/*` | Factsheets | Trigger AMC factsheet pipeline (fetch → extract → store) |
| `/assets/*` | Household Assets | Non-MF asset CRUD, asset type listing |
| `/wealth/*` | Wealth Summary | Aggregated wealth view (MF + household assets), total wealth |
| `/backup` | Backup | Database backup download |

## Frontend Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | AUM, total wealth, market pulse, quick actions, profiling summary |
| `/fund-intelligence` | FundIntelligence | Fund search, compare, SIP backtest, category heatmap |
| `/crm` | ClientCRM | Client database, notes, reviews, tags |
| `/profile/:clientId` | ClientProfile | 5-step risk profiling wizard |
| `/portfolio-xray` | PortfolioXray | Portfolio analysis, allocation, overlap + wealth tab |
| `/wealth` | WealthView | Unified household wealth view (MF + non-MF asset CRUD, allocation charts) |
| `/goal-planner` | GoalPlanner | Life goals, SIP planning, projections |
| `/tax-optimizer` | TaxOptimizer | Tax analysis, harvesting, estimator |
| `/report-generator` | ReportGenerator | AI-powered branded PDF reports |
| `/scoring` | Recommendations | Fund scoring landing (all clients) |
| `/scoring/:clientId` | Recommendations | Fund scoring results + SIP allocation for client |
| `/dev` | DevLog | System health, DB stats, API status |
| `/login` | LoginPage | Password-based auth (shown when unauthenticated) |

## Financial Formulas

- **SIP Future Value**: `FV = SIP * [((1+r)^n - 1) / r] * (1+r)` where r = monthly rate, n = months
- **Inflation Adjustment**: `FV = PV * (1 + inflation)^years`
- **Required SIP**: Derives from target minus FV of current savings, divided by SIP factor
- **Returns**: Point-to-point CAGR for 1Y/3Y/5Y periods from NAV history
- **Risk Metrics**: Standard deviation, max drawdown, Sharpe ratio, Sortino ratio, Calmar ratio, Jensen's alpha
- **Monte Carlo**: Goal survival probability via t-distribution sampling with stress scenarios

## Conventions

- All currency displayed in INR format (`en-IN` locale, `Intl.NumberFormat`; Cr/L shorthand in UI)
- Dates stored as ISO strings in SQLite
- Toast notifications for all user-facing success/error feedback
- Mobile-responsive: hamburger sidebar below `lg` breakpoint, slide-over drawers for detail panels
- Each page includes SEBI disclaimer where applicable
- Dark-themed UI: surface-900 backgrounds, slate/amber accents
