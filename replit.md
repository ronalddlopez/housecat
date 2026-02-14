# HouseCat

## Overview
HouseCat is a service health monitoring dashboard with a multi-agent test pipeline. It connects to external services (Upstash Redis, QStash, TinyFish, Anthropic Claude) and provides a visual dashboard for monitoring connection status, running sanity checks, and executing AI-powered browser tests.

## Project Architecture
- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui components (served via Vite through Express on port 5000)
- **Backend:** Python FastAPI (runs on port 8000, proxied via Express `/api/*`)
- **Dev Server:** Express.js on port 5000 handles Vite dev server + proxies API requests to FastAPI
- **Multi-Agent Pipeline:** Planner → Browser → Evaluator (pydantic-ai agents using Claude Haiku)
- **UI Layout:** Sidebar navigation (shadcn Sidebar) with 4 pages: Dashboard, Tests, Run Test, Settings
- **External Services:**
  - Upstash Redis (data store)
  - QStash (message queue)
  - TinyFish (browser automation)
  - Anthropic Claude (AI agent)

## Frontend Pages
- `/` — Dashboard: placeholder metrics (total/passing/failing) + empty state with links
- `/tests` — Tests: empty state placeholder for future test suite CRUD
- `/run` — Run Test: URL + goal form → triggers Planner → Browser → Evaluator pipeline
- `/settings` — Settings: service health cards + sanity check buttons

## Key Files
- `client/src/App.tsx` - App root with SidebarProvider, routes, layout
- `client/src/components/app-sidebar.tsx` - Sidebar navigation component
- `client/src/pages/dashboard.tsx` - Dashboard page (placeholder metrics)
- `client/src/pages/tests.tsx` - Tests page (placeholder empty state)
- `client/src/pages/run-test.tsx` - Run Test page (pipeline form + results)
- `client/src/pages/settings.tsx` - Settings page (health + sanity checks)
- `backend/main.py` - FastAPI application with all API routes
- `backend/models.py` - Pydantic models shared across agents (TestStep, TestPlan, StepResult, BrowserResult, TestResult)
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
- `POST /api/callback/:testId` - QStash callback endpoint
- `POST /api/tests/:testId/run` - Run multi-agent test pipeline (accepts JSON body with `url` and `goal`)
- `POST /api/test/tinyfish` - TinyFish sanity check
- `POST /api/test/agent` - Claude AI sanity check
- `POST /api/test/qstash` - QStash delivery test

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
- `QSTASH_CURRENT_SIGNING_KEY` - QStash webhook signing key
- `QSTASH_NEXT_SIGNING_KEY` - QStash next webhook signing key
- `TINYFISH_API_KEY` - TinyFish API key
- `ANTHROPIC_API_KEY` - Anthropic API key

## How It Works (Dev Mode)
1. Express starts FastAPI as a child process on port 8000
2. Express starts Vite dev server on port 5000
3. All `/api/*` requests are proxied from Express to FastAPI (120s timeout)
4. React frontend is served by Vite with HMR
5. Express body-parsing middleware skips `/api` routes so the proxy can forward raw bodies

## Recent Changes
- 2026-02-14: Phase 1.5 UI reorganization — sidebar navigation + 4 pages (Dashboard, Tests, Run Test, Settings)
- 2026-02-14: Fixed Express body-parsing conflict with API proxy (skip /api routes)
- 2026-02-14: Phase 1 multi-agent pipeline implemented (Planner → Browser → Evaluator)
- 2026-02-14: Cleaned up unused template leftovers (Drizzle, PostgreSQL, unused Upstash JS SDKs)
- 2026-02-14: Phase 0 scaffold created with health check dashboard and sanity test endpoints
- 2026-02-14: Migrated backend from Express/Node.js to Python/FastAPI
