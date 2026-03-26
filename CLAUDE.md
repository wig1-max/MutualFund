# TEJOVA MFD OPS TOOLKIT

Internal operations toolkit for Tejova, a mutual fund distribution practice based in Panchkula, Haryana.

## Project Structure

```
MutualFund/
├── backend/                    # Node.js Express API (port 3001)
│   ├── server.js               # Entry point, mounts all routers under /api
│   ├── db/
│   │   ├── index.js            # SQLite (better-sqlite3) singleton with WAL mode
│   │   ├── schema.sql          # Tables: funds, clients, client_notes, client_holdings, client_goals, nav_cache
│   │   └── tejova.db           # SQLite database file (gitignored)
│   ├── routes/
│   │   ├── funds.js            # Fund search, NAV, returns, SIP backtest, category heatmap
│   │   ├── clients.js          # Client CRUD, notes, review scheduling, tags
│   │   ├── portfolio.js        # Holdings CRUD, portfolio analysis (allocation, overlap, underperformers)
│   │   ├── goals.js            # Goal CRUD, SIP calculator, projections
│   │   ├── tax.js              # Tax analysis (Budget 2024 rules), harvesting opportunities
│   │   ├── reports.js          # AI report generation via Claude API
│   │   └── backup.js           # Database backup download
│   ├── services/
│   │   ├── mfapi.js            # mfapi.in API wrapper (NAV history, latest NAV)
│   │   ├── amfi.js             # AMFI NAV feed sync (bulk fund data)
│   │   ├── calculations.js     # Return calculations, SIP backtest, NAV lookups
│   │   └── navCache.js         # SQLite-backed NAV cache with 24h TTL, batch prefetch
│   └── data/
│       └── fund-holdings.json  # Static fund holdings data for overlap analysis
├── frontend/                   # React (Vite) + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx             # BrowserRouter with all routes
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Tailwind imports + custom animations
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx           # Module 0: AUM, market pulse, quick actions
│   │   │   ├── FundIntelligence.jsx    # Module 1: Fund search, compare, SIP backtest, categories
│   │   │   ├── ClientCRM.jsx           # Module 2: Client database, notes, reviews, tags
│   │   │   ├── PortfolioXray.jsx       # Module 3: Portfolio analysis, allocation, overlap
│   │   │   ├── GoalPlanner.jsx         # Module 4: Life goals, SIP planning, projections
│   │   │   ├── TaxOptimizer.jsx        # Module 5: Tax analysis, harvesting, estimator
│   │   │   └── ReportGenerator.jsx     # Module 6: AI-powered branded PDF reports
│   │   ├── components/
│   │   │   ├── Sidebar.jsx       # Responsive nav (desktop collapsible + mobile hamburger)
│   │   │   ├── Toast.jsx         # Toast notification context + provider
│   │   │   ├── ErrorBoundary.jsx # React error boundary
│   │   │   └── FundSearch.jsx    # Reusable fund search component
│   │   ├── contexts/
│   │   │   └── ClientContext.jsx # Shared client state across pages
│   │   ├── services/
│   │   │   └── api.js           # All API call functions
│   │   ├── hooks/
│   │   │   └── useFundSearch.js # Fund search hook
│   │   └── lib/
│   │       └── utils.js         # cn() utility (clsx + tailwind-merge)
│   └── vite.config.js          # Vite config with /api proxy to localhost:3001
```

## Tech Stack

- **Frontend**: React 19 (Vite 8) + Tailwind CSS 4 + Recharts 3 + Lucide React icons
- **Backend**: Node.js + Express 4 (ES modules)
- **Database**: SQLite via better-sqlite3 (WAL mode, foreign keys enabled)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) for report generation
- **Data Sources**: mfapi.in (NAV history), AMFI NAV feed (bulk fund data)
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

- `PORT` — Backend port (default: 3001)
- `ANTHROPIC_API_KEY` — Required for Module 6 (AI Report Generator)

## Key Architecture Decisions

- **No ORM**: Direct SQL via better-sqlite3 prepared statements (synchronous API)
- **NAV Cache**: `nav_cache` SQLite table with 24h TTL avoids repeated mfapi.in hits; `batchPrefetchNavs()` fetches multiple schemes in parallel
- **SIP Date Handling**: Fixed base date + monthOffset approach (not Date.setMonth) to avoid date drift; day clamped to 28 max
- **Tax Rules**: Budget 2024 rates — Equity STCG 20%, LTCG 12.5% (exempt up to 1.25L), Debt at 30% slab
- **Fund Classification**: `isEquityFund()` checks AMFI category keywords to determine equity vs debt treatment
- **Scheme Code Validation**: `/^\d{4,6}$/` regex on all fund code endpoints
- **Print-to-PDF**: Reports open a styled print window rather than server-side PDF generation
- **Component Hierarchy**: `ErrorBoundary > ToastProvider > BrowserRouter > ClientProvider > Routes`

## Database Schema (SQLite)

Tables: `funds`, `clients`, `client_notes`, `client_holdings`, `client_goals`, `nav_cache`

- Schema auto-creates on first connection via `db/schema.sql`
- DB file: `backend/db/tejova.db`
- Backup endpoint: `GET /api/backup` (downloads timestamped copy)

## API Routes

All routes are prefixed with `/api`:

| Route | Module | Description |
|-------|--------|-------------|
| `/funds/*` | Fund Intelligence | Search, NAV, returns, SIP backtest, categories, heatmap |
| `/clients/*` | Client CRM | CRUD, notes, review scheduling, stats |
| `/portfolio/*` | Portfolio X-Ray | Holdings CRUD, analysis (allocation, overlap, underperformers) |
| `/goals/*` | Goal Planner | Goal CRUD, SIP calculator, summary |
| `/tax/*` | Tax Optimizer | Tax analysis, standalone estimator |
| `/reports/*` | Report Generator | AI report generation (requires ANTHROPIC_API_KEY) |
| `/backup` | Dashboard | Database backup download |
| `/health` | - | Health check |

## Financial Formulas

- **SIP Future Value**: `FV = SIP * [((1+r)^n - 1) / r] * (1+r)` where r = monthly rate, n = months
- **Inflation Adjustment**: `FV = PV * (1 + inflation)^years`
- **Required SIP**: Derives from target minus FV of current savings, divided by SIP factor
- **Returns**: Point-to-point for 1Y/3Y/5Y periods from NAV history

## Conventions

- All currency displayed in INR format (`en-IN` locale, `Intl.NumberFormat`)
- Dates stored as ISO strings in SQLite
- Toast notifications for all user-facing success/error feedback
- Mobile-responsive: hamburger sidebar below `lg` breakpoint, slide-over drawers for detail panels
- Each page includes SEBI disclaimer where applicable
