# HouseCat

## Overview
HouseCat is a service health monitoring dashboard with a multi-agent test pipeline. It connects to external services (Upstash Redis, QStash, TinyFish, Anthropic Claude) and provides a visual dashboard for monitoring connection status, running sanity checks, and executing AI-powered browser tests.

## Project Architecture
- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui components (served via Vite through Express on port 5000)
- **Backend:** Python FastAPI (runs on port 8000, proxied via Express `/api/*`)
- **Dev Server:** Express.js on port 5000 handles Vite dev server + proxies API requests to FastAPI
- **Multi-Agent Pipeline:** Planner → Browser → Evaluator (pydantic-ai agents using Claude Haiku)
- **Data Store:** Upstash Redis (all state stored as Redis Hashes/Sets, no SQL)
- **UI Layout:** Sidebar navigation (shadcn Sidebar) with 5 pages: Dashboard, Tests, Test Detail, Run Test, Settings
- **Screenshot Service:** Playwright (Chromium) singleton browser for post-run screenshots (JPEG, 1280x720)
- **External Services:**
  - Upstash Redis (data store)
  - QStash (cron scheduling for test suites)
  - TinyFish (browser automation)
  - Anthropic Claude (AI agent)

## Redis Key Schema
```
test:{id}           → Hash    (test suite definition)
tests:all           → Set     (index of all test IDs)
results:{id}        → Sorted Set (Phase 3 — test results, score=timestamp)
timing:{id}         → Sorted Set (Phase 3 — response times, score=timestamp)
events:{id}         → Stream    (Phase 3 — execution event log)
incidents:{id}      → List      (Phase 3 — failure incidents)
```

## Key Files
- `client/src/App.tsx` - App root with SidebarProvider, routes, layout
- `client/src/components/app-sidebar.tsx` - Sidebar navigation component
- `client/src/pages/dashboard.tsx` - Dashboard page (server-computed metrics from /api/dashboard)
- `client/src/pages/tests.tsx` - Tests page (CRUD with create/edit dialogs, delete confirmation)
- `client/src/pages/test-detail.tsx` - Test Detail page (chart, history, incidents, run now)
- `client/src/pages/run-test.tsx` - Run Test page (pipeline form + results)
- `client/src/pages/settings.tsx` - Settings page (health + sanity checks)
- `backend/main.py` - FastAPI application with core routes (health, callback, sanity checks, manual run)
- `backend/models.py` - Pydantic models for agents + TestSuite CRUD schemas
- `backend/api/tests.py` - FastAPI router for /api/tests CRUD endpoints
- `backend/api/results.py` - FastAPI router for results, timing, uptime, incidents, dashboard, SSE live events
- `backend/services/test_suite.py` - Redis CRUD + QStash schedule management for test suites
- `backend/services/tinyfish.py` - TinyFish API client with SSE parsing
- `backend/agents/planner.py` - Planner Agent: translates test goals into TinyFish prompts
- `backend/agents/browser.py` - Browser Agent: executes tests via TinyFish
- `backend/agents/evaluator.py` - Evaluator Agent: synthesizes final pass/fail verdict
- `backend/agents/pipeline.py` - Pipeline orchestrator: ties all three agents together
- `backend/run_pipeline.py` - CLI entry point for testing the pipeline
- `server/index.ts` - Express dev server that starts FastAPI and serves Vite
- `server/routes.ts` - Proxy configuration (forwards /api/* to FastAPI, 120s timeout)
- `shared/schema.ts` - Shared TypeScript types

## API Endpoints (served by FastAPI on port 8000, proxied on port 5000)
- `GET /api/health` - Health check for all services
- `POST /api/callback/{testId}` - QStash callback endpoint
- `POST /api/run-test` - Manual pipeline run (accepts JSON body with `url` and `goal`)
- `GET /api/tests` - List all test suites
- `POST /api/tests` - Create a test suite (registers QStash cron)
- `GET /api/tests/{id}` - Get single test suite
- `PUT /api/tests/{id}` - Update test suite (handles QStash schedule changes)
- `DELETE /api/tests/{id}` - Delete test suite + QStash schedule + related data
- `POST /api/tests/{id}/run` - Manually trigger pipeline for a saved test
- `POST /api/test/tinyfish` - TinyFish sanity check
- `POST /api/test/agent` - Claude AI sanity check
- `POST /api/test/qstash` - QStash delivery test
- `GET /api/tests/{id}/results` - Paginated run history (query: limit, offset)
- `GET /api/tests/{id}/timing` - Response time series (query: limit)
- `GET /api/tests/{id}/uptime` - Uptime percentage (query: hours)
- `GET /api/tests/{id}/incidents` - Recent failure incidents (query: limit)
- `GET /api/dashboard` - Server-computed aggregate metrics
- `GET /api/tests/{id}/live` - SSE stream of pipeline execution events

## Multi-Agent Pipeline (Phase 1)
The pipeline runs three AI agents in sequence:
1. **Planner** - Takes a URL + goal, generates a TinyFish prompt with numbered STEPs and expected JSON output format
2. **Browser** - Calls TinyFish with the generated prompt, parses per-step results
3. **Evaluator** - Compares requested vs actual results, produces final verdict

CLI usage: `python -m backend.run_pipeline "https://example.com" "Verify the page has a heading"`

## Environment Variables (Secrets)
- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `QSTASH_TOKEN` - QStash token
- `QSTASH_URL` - QStash base URL
- `TINYFISH_API_KEY` - TinyFish API key
- `ANTHROPIC_API_KEY` - Anthropic API key

## User Preferences
- **Windows compatibility**: `server/index.ts` uses a cross-platform `getPythonCommand()` helper — `py -3.12` on Windows, `python3` on Linux/macOS. Do NOT overwrite this with a hardcoded command. If installing shadcn components or making other changes, never modify the existing `server/index.ts`, `client/src/components/ui/button.tsx`, `client/src/components/ui/select.tsx`, or `client/src/components/ui/alert-dialog.tsx` files unless explicitly needed for the task.
- **UI component safety**: The project uses custom `hover-elevate` / `active-elevate-2` utilities and `min-h-*` sizing in Button, Select, and AlertDialog. Running `npx shadcn@latest add --overwrite` will replace these customizations — avoid `--overwrite` or manually restore after.

## How It Works (Dev Mode)
1. Express starts FastAPI as a child process on port 8000
2. Express starts Vite dev server on port 5000
3. All `/api/*` requests are proxied from Express to FastAPI (120s timeout)
4. React frontend is served by Vite with HMR
5. Express body-parsing middleware skips `/api` routes so the proxy can forward raw bodies

## Frontend Pages
- `/` — Dashboard: server-computed metrics from /api/dashboard (total, active, passing, failing, pending) + clickable recent test runs
- `/tests` — Tests: CRUD for test suites (create, edit, delete, pause/resume) + Run Now button + clickable cards linking to detail
- `/tests/:id` — Test Detail: live execution panel (SSE), response time chart (recharts), uptime card, expandable history rows with 5-tab detail (Summary/Screenshots/Evidence/Raw JSON/Plan), incidents tab, Run Now + Pause/Resume
- `/run` — Run Test: URL + goal form → triggers Planner → Browser → Evaluator pipeline
- `/settings` — Settings: service health cards + sanity check buttons

## Recent Changes
- 2026-02-15: Phase 7 — Rich Run Details + Screenshots: Playwright screenshot service (singleton browser), enriched RunRecord (plan, tinyfish_raw/data, streaming_url, screenshots), expandable history rows with 5-tab detail view, enhanced dashboard with steps/duration/source
- 2026-02-15: Phase 6 — Live Execution View: LiveExecutionPanel with SSE streaming, phase indicator, step tracker, browser preview iframe, event log, auto-dismiss
- 2026-02-15: Phase 5 — Frontend: Dashboard wired to /api/dashboard, new test detail page with chart/history/incidents, tests page Run Now button + clickable cards
- 2026-02-15: Phase 4 — Results & Metrics API: 6 new endpoints (results history, timing, uptime, incidents, dashboard, SSE live events) in backend/api/results.py
- 2026-02-15: Phase 3 — QStash callback handler, result persistence (Sorted Sets), event logging (Streams), incident tracking (Lists), alert webhooks on failure
- 2026-02-14: Phase 2 — Test Suite CRUD API backed by Redis + QStash cron scheduling + Tests page UI with create/edit/delete
- 2026-02-14: Phase 2 — Dashboard wired to real metrics from /api/tests
- 2026-02-14: Phase 1.5 UI reorganization — sidebar navigation + 4 pages (Dashboard, Tests, Run Test, Settings)
- 2026-02-14: Fixed Express body-parsing conflict with API proxy (skip /api routes)
- 2026-02-14: Phase 1 multi-agent pipeline implemented (Planner → Browser → Evaluator)
- 2026-02-14: Cleaned up unused template leftovers (Drizzle, PostgreSQL, unused Upstash JS SDKs)
- 2026-02-14: Phase 0 scaffold created with health check dashboard and sanity test endpoints
- 2026-02-14: Migrated backend from Express/Node.js to Python/FastAPI
