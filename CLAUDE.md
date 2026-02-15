# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HouseCat is an AI-powered QA testing agent — "CodeRabbit for QA." Users describe tests in plain English, and a multi-agent AI pipeline runs them in a real browser on a schedule. Built for the February 2026 Online Open Source Agents Hackathon.

## Architecture

```
Client (React 18 + Vite + Tailwind + shadcn/ui) [port 5000 via Express]
    ↓ /api/* proxied (120s timeout)
Express 5 server [port 5000] ← spawns FastAPI + Vite dev server
    ↓
FastAPI [port 8000] ← Python child process
    ↓
Upstash Redis (REST API) — all state, no SQL database
QStash — cron scheduling for test execution
TinyFish — AI browser automation (SSE streaming)
Anthropic Claude — pydantic-ai agents (Haiku 4.5)
```

Express on port 5000 is the single entry point. It proxies `/api/*` to FastAPI on 8000 and serves the Vite React app for everything else. Body parsing is skipped for `/api` routes so the proxy forwards raw bodies.

## Commands

```bash
# Development (from project root)
npm install                  # Install Node dependencies
npm run dev                  # Start Express + FastAPI + Vite HMR

# Python backend dependencies
py -3.12 -m pip install -r backend/requirements.txt   # Windows
pip install -r backend/requirements.txt                # Linux/macOS

# CLI pipeline test
python -m backend.run_pipeline "https://example.com" "Verify the page loads"

# TypeScript check
npm run check

# Production build
npm run build
npm start
```

## Multi-Agent Pipeline

Three pydantic-ai agents run sequentially in `backend/agents/pipeline.py`:

1. **Planner** (`planner.py`) — Takes URL + goal → generates TinyFish prompt with numbered STEP instructions and expected JSON output format. Output: `TestPlan`
2. **Browser** (`browser.py`) — Calls TinyFish API with the prompt via `@agent.tool`, parses per-step results. Output: `BrowserResult`
3. **Evaluator** (`evaluator.py`) — Compares requested goal vs actual results → pass/fail verdict with detailed assessment. Output: `TestResult`

All agents use `claude-haiku-4-5-20251001` with `UsageLimits(request_limit=N)` to cap API calls.

## Redis Data Model (No SQL)

```
test:{id}        → Hash (test suite config: name, url, goal, schedule, status)
tests:all        → Set (index of all test IDs)
results:{id}     → Sorted Set (test results by timestamp)
timing:{id}      → Sorted Set (response times)
events:{id}      → Stream (execution event log)
incidents:{id}   → List (failure incidents)
```

## QStash Scheduling

Test suites have cron expressions (default `*/15 * * * *`). QStash calls `POST /api/callback/{testId}` on schedule. Pausing a test deletes the QStash schedule; resuming recreates it.

## TinyFish Integration

`backend/services/tinyfish.py` streams SSE from TinyFish's API. Event types: `STREAMING_URL`, `STEP`, `COMPLETE`, `ERROR`. The COMPLETE event contains the JSON result from browser automation.

## Screenshots

`backend/services/screenshot.py` uses a Playwright singleton browser to capture before/after screenshots for each test step. Playwright must be installed (`playwright install chromium`).

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Health check for all services |
| `POST /api/run-test` | Manual pipeline run: `{url, goal}` |
| `POST /api/callback/{testId}` | QStash callback (validates `upstash-signature`) |
| `GET/POST /api/tests` | List / Create test suites |
| `GET/PUT/DELETE /api/tests/{id}` | CRUD single test |
| `POST /api/tests/{id}/run` | Run saved test through pipeline |
| `GET /api/tests/{id}/results` | Paginated run results |
| `GET /api/tests/{id}/results/{runId}` | Single run detail |
| `GET /api/tests/{id}/timing` | Timing data (paginated) |
| `GET /api/tests/{id}/uptime` | Uptime metrics over time window |
| `GET /api/dashboard` | Aggregated dashboard stats |
| `POST /api/test/{tinyfish,agent,qstash}` | Sanity checks |

## Frontend

- **Router**: Wouter (not React Router). Routes: `/` (dashboard), `/tests`, `/run`, `/settings`
- **State**: TanStack Query. Dashboard polls `/api/tests` every 30s
- **UI**: shadcn/ui with custom `hover-elevate` and `active-elevate-2` utilities on Button/Select/AlertDialog. Do NOT run `npx shadcn@latest add --overwrite` — it will replace custom utilities
- **Path aliases**: `@/*` → `client/src/*`, `@shared/*` → `shared/*` (configured in tsconfig.json and vite.config.ts)

## Windows Compatibility

`server/index.ts` has platform detection via `getPythonCommand()`: uses `py -3.12` on Windows, `python3` on Linux/macOS. Do not hardcode Python commands.

## Environment Variables (.env in project root)

```
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
TINYFISH_API_KEY
ANTHROPIC_API_KEY
REPLIT_DEV_DOMAIN (optional, for Replit public URL)
PUBLIC_URL (fallback: http://localhost:5000)
```

## Notes

- No unit/integration test suite exists yet. There is no test runner configured.
- Express auto-restarts the FastAPI child process if it crashes (2s delay).
