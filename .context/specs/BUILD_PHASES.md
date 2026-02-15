# HouseCat — Build Phases

High-level phase-by-phase plan. Each phase gets its own detailed implementation plan before we start building it.

---

## Phase 0: Project Scaffold + Deploy ✅ COMPLETE
**Goal:** Fresh repo running on Replit with a public URL. All external services connected.

**What was delivered (Replit agent built beyond the plan):**

Backend (`backend/main.py` — FastAPI):
- Health check endpoint (`GET /api/health`) — verifies Redis, QStash, TinyFish, Anthropic
- TinyFish sanity test (`POST /api/test/tinyfish`) — live browser automation call with SSE parsing
- Claude agent test (`POST /api/test/agent`) — direct Anthropic API call
- QStash delivery test (`POST /api/test/qstash`) — sends message to self
- Callback placeholder (`POST /api/callback/{test_id}`)
- Manual trigger placeholder (`POST /api/tests/{test_id}/run`)
- SPA serving for production builds

Frontend (`client/` — React 18 + Vite + TanStack Query + Tailwind + shadcn/ui):
- Dashboard with service health cards (status badges, error display)
- Runnable sanity check buttons for TinyFish, Claude, QStash
- Dark/light theme toggle
- Full shadcn/ui component library (40+ components pre-installed)
- wouter routing, TanStack Query with `apiRequest` helper

Infrastructure:
- Express dev server proxying `/api` → FastAPI on port 8000
- `start-dev.sh` orchestrates both servers
- Git repo on GitHub (public)
- All environment variables configured in Replit Secrets

**Exit Criteria:** ✅ All services green on dashboard. Sanity checks pass.

---

## Phase 1: Multi-Agent Engine
**Goal:** The core multi-agent pipeline that runs a test using Pydantic AI + TinyFish. Three agents (Planner → Browser → Evaluator) work together. Works from the command line — no API, no frontend.

### Pydantic Models (Structured Output)
- `TestStep` — single step in a test plan (`step_number`, `description`, `success_criteria`)
- `TestPlan` — output of Planner agent (`steps: list[TestStep]`)
- `StepResult` — output of Browser agent per step (`passed`, `details`, `retry_count`)
- `TestResult` — final output from Evaluator (`passed`, `duration_ms`, `steps_passed`, `steps_total`, `step_results`, `details`, `error`)

### Agent 1: Planner
- `planner_agent = Agent('anthropic:claude-haiku-4-5-20251001', output_type=TestPlan)`
- Takes URL + natural language goal, decomposes into 3-6 discrete test steps
- No tools — pure reasoning (single LLM call)
- `UsageLimits(request_limit=3)`

### Agent 2: Browser (with Tools)
- `browser_agent = Agent('anthropic:claude-haiku-4-5-20251001', output_type=StepResult, deps_type=BrowserDeps)`
- `browse` tool (`@browser_agent.tool_plain`) — calls TinyFish SSE API
- Executes one step at a time, called in a loop from the orchestrator
- Can retry a step with adapted approach if it fails (up to 2 retries)
- `UsageLimits(request_limit=4)` per step (allows retries)

### Agent 3: Evaluator
- `evaluator_agent = Agent('anthropic:claude-haiku-4-5-20251001', output_type=TestResult)`
- `http_request` tool (`@evaluator_agent.tool_plain`) — for sending alert webhooks on failure
- Receives original goal + all step results, synthesizes final verdict
- `UsageLimits(request_limit=3)`

### Orchestration
- `run_test()` function: calls Planner → loops Browser over each step → calls Evaluator
- Logs each step to Redis Stream for live view
- TinyFish SSE parsing (handle STREAMING_URL, STEP, COMPLETE, ERROR events)

**Exit Criteria:** Run from terminal — `python run_agent.py "https://example.com" "Verify the page loads and has a heading"` → Planner creates 3 steps → Browser executes each → Evaluator returns `TestResult(passed=True, steps_passed=3, steps_total=3, ...)`

**Risk:** This is the hardest phase. If the multi-agent pipeline works, everything else is CRUD. Fallback: if multi-agent is too slow, collapse Planner+Browser into a single agent that calls TinyFish multiple times.

---

## Phase 1.5: UI Reorganization ✅ COMPLETE
**Goal:** Transform single-page health dashboard into a professional developer-tool layout (CodeRabbit/Greptile style) with sidebar navigation and multiple pages.

**What was delivered:**
- Sidebar navigation with 4 items: Dashboard, Tests, Run Test, Settings
- `app-sidebar.tsx` using shadcn/ui Sidebar component with active page highlighting
- Layout wrapper: sidebar + scrollable content area (max-w-5xl)
- **Dashboard** (`/`) — placeholder metric cards (Total/Passing/Failing) + empty state with links
- **Tests** (`/tests`) — empty state with disabled "+ New Test" button, link to Run Test
- **Run Test** (`/run`) — full pipeline form + results display (moved from old dashboard)
- **Settings** (`/settings`) — service health cards + sanity checks (moved from old dashboard)
- Sidebar collapse toggle + theme toggle in header
- wouter routing, no new dependencies

**Exit Criteria:** ✅ All pages accessible via sidebar nav. Existing functionality preserved.

---

## Phase 2: Test Suite API + Redis Data Model ✅ COMPLETE
**Goal:** CRUD endpoints for test suites, backed by Redis. QStash cron registration.

**What was delivered:**

Backend (`services/test_suite.py` + `api/tests.py`):
- `POST /api/tests` — create test suite, store in Redis Hash, register QStash cron
- `GET /api/tests` — list all tests from Redis Set index
- `GET /api/tests/{id}` — get test details from Redis Hash
- `PUT /api/tests/{id}` — update test suite, update QStash schedule if cron changed
- `DELETE /api/tests/{id}` — delete test + remove QStash schedule + clean all related Redis keys
- Redis key schema: `test:{id}` Hash, `tests:all` Set
- QStash lifecycle: create on POST, delete on DELETE, update on PUT
- Redis-before-QStash ordering (no orphaned schedules)
- Pause/Resume: deletes QStash schedule on pause, recreates on resume
- `POST /api/tests/{id}/run` — manual trigger loads test from Redis and runs pipeline

Frontend (`tests.tsx` + `dashboard.tsx`):
- Tests page with card-based test list (name, URL, schedule label, status badge, result badge)
- "+ New Test" dialog with form: name, URL, goal, schedule dropdown (7 options), alert webhook
- Edit dialog (pre-filled form), delete confirmation dialog
- Pause/Resume toggle button per test (bonus — not in original plan)
- Dashboard wired to real data: total/passing/failing metrics from `/api/tests`
- Recent test runs section sorted by last_run_at

Pydantic models added: `CreateTestSuite`, `UpdateTestSuite`, `TestSuiteResponse`, `TestSuiteListResponse`

**Exit Criteria:** ✅ Full CRUD from UI. QStash schedules created in Upstash console.

---

## Phase 3: QStash Callback + Result Storage ✅ COMPLETE
**Goal:** QStash triggers test execution. Results stored in Redis for querying.

**What was delivered:**

Backend — New services:
- `services/config.py` — Extracted shared `get_redis()`, `get_qstash()`, `get_public_url()` (fixes Phase 2 duplication)
- `services/result_store.py` — `store_run_result()` writes to 4 Redis keys per run + `log_event()` writes to Stream
- `services/alert.py` — Async `send_alert_webhook()` with httpx, fires on test failure

Backend — Updated files:
- `POST /api/callback/{test_id}` — Full implementation: loads test, skips if paused, runs pipeline, stores result, sends alert, updates incident
- `POST /api/tests/{id}/run` — Manual trigger now persists results (same logic as callback)
- `agents/pipeline.py` — Added optional `test_id` param, `_log()` helper for event logging with silent failure handling

Redis data written per run:
- `results:{test_id}` Sorted Set — full RunRecord JSON (score=timestamp)
- `timing:{test_id}` Sorted Set — duration_ms (score=timestamp)
- `events:{test_id}` Stream — step-by-step execution log (plan_start → plan_complete → browser_start → step_complete × N → eval_start → eval_complete)
- `incidents:{test_id}` List — failure records with alert_sent tracking
- `test:{test_id}` Hash — `last_result` and `last_run_at` updated

**Known issue:** All imports use `backend.` prefix (e.g., `from backend.services.config import ...`). Requires running as package from parent directory. Fix queued.

**Exit Criteria:** ✅ QStash callback runs pipeline and stores results. Manual run also persists. Alerts fire on failure.

---

## Phase 4: Results & Metrics API ✅ COMPLETE
**Goal:** Endpoints to query test history, timing, and uptime for the frontend.

**What was delivered:**

New file — `api/results.py` (6 endpoints):
- `GET /api/tests/{id}/results` — paginated run history from Sorted Set (`ZREVRANGE` with offset/limit)
- `GET /api/tests/{id}/timing` — response time series with timestamps (`ZREVRANGE WITHSCORES`)
- `GET /api/tests/{id}/uptime` — uptime percentage over configurable hour window (`ZRANGEBYSCORE`)
- `GET /api/tests/{id}/incidents` — recent failure list from List (`LRANGE`)
- `GET /api/dashboard` — server-side aggregate metrics (total/active/paused/passing/failing/pending + top 5 recent runs)
- `GET /api/tests/{id}/live` — SSE endpoint streaming Redis Stream events with replay, 1s polling, 15s keepalive, 5min timeout, `Last-Event-ID` resume support

Fixes applied:
- `backend.` import prefix removed from all Python files — app now runs with `uvicorn main:app` from `backend/`
- Timing Sorted Set uniqueness fix — stores `f"{run_id}:{duration_ms}"` instead of bare `duration_ms`

Bonus beyond plan:
- QStash signature verification added to callback endpoint (uses `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY`)
- Incident alert_sent update improved — searches by `run_id` instead of assuming index 0

**Exit Criteria:** ✅ All endpoints return correct data. SSE endpoint streams events in real-time.

---

## Phase 5: Frontend — Dashboard + Test Detail Page ✅ COMPLETE
**Goal:** Wire frontend to Phase 4 API endpoints. Dashboard with real metrics, test detail page with full observability.

**What was delivered:**

Dashboard (`/`) — rewritten:
- Switched from client-side computation (`/api/tests`) to server-side metrics (`/api/dashboard`)
- 5 metric cards: Total, Active, Passing, Failing, Pending (was 3)
- Clickable recent runs → navigate to test detail page
- Relative timestamps via `date-fns` `formatDistanceToNow()`

Test Detail Page (`/tests/:id`) — **new page** (529 lines):
- Header with test name, URL, status/result badges, Run Now + Pause/Resume buttons
- 3 metric cards: Uptime % (24h), Last Result, Avg Response Time
- Response time chart (recharts AreaChart with gradient fill, themed light/dark, tooltips)
- History tab: table with Run ID, pass/fail badge, steps, duration, source (manual/qstash), time
- Incidents tab: failure cards with error details, alert sent badge, timestamps
- Loading skeletons, empty states, 5 parallel TanStack Query fetches

Tests Page (`/tests`) — updated:
- Run Now button per test card (green play icon, spinner while running, `stopPropagation`)
- Clickable card bodies → navigate to `/tests/{id}`

**Exit Criteria:** ✅ Create test → run it → see results in dashboard + detail page with charts.

---

## Phase 6: Live Execution View ✅ COMPLETE
**Goal:** Watch the agent work in real-time. The "wow factor" for judges.

**What was delivered:**

Frontend — `components/live-execution-panel.tsx` (437 lines):
- **Phase indicator**: Planning (Sparkles) → Browsing (Globe) → Evaluating (Brain) with connector lines, done/active/pending/error states
- **Step tracker**: Steps appear from plan_complete event, tick off pass/fail in real-time, first step auto-marked as "running" on browser_start
- **Browser preview**: TinyFish iframe (`aspect-video`) + "Open Preview" external link fallback + skeleton placeholder while waiting
- **Event log**: Monospace scrolling log with timestamps, auto-scroll via ref, error messages in red
- **SSE connection**: EventSource to `/api/tests/{id}/live`, 1s connect delay, proper cleanup on unmount
- **Animations**: Framer Motion `AnimatePresence` for smooth panel appear/disappear
- **Auto-hide**: 8s timer after completion, plus manual "Dismiss" button
- **Run trigger**: Counter-based `runTrigger` pattern (not boolean) to correctly handle re-runs

Backend — `agents/pipeline.py` updated:
- Events stream cleared before each new run (`redis.delete(f"events:{test_id}")`)
- `browser_preview` event logged with `streaming_url`
- `plan_complete` event includes JSON-encoded step descriptions
- `browser_start` event logged before TinyFish call

Integration — `pages/test-detail.tsx`:
- `LiveExecutionPanel` placed between metric cards and response time chart
- Run Now button increments `runTrigger` counter + fires mutation
- `onComplete` callback invalidates all 7 query keys

**Exit Criteria:** ✅ Click "Run Now" → live panel appears → phase indicator progresses → steps tick off → browser preview shows → verdict displayed → panel auto-hides.

---

## Phase 7: Polish + Demo Prep
**Goal:** Make it demo-ready for judges.

- Pre-seed 2-3 test suites against real sites (or a demo app)
- Let tests run for several cycles so Redis has history
- Error handling and loading states in frontend
- README with setup instructions, architecture diagram, screenshots
- Demo script rehearsal
- Record video walkthrough if required by hackathon

**Exit Criteria:** Can deliver the 2-3 minute demo script from `housecat.md` end-to-end.

---

## Phase Dependencies

```
Phase 0 (scaffold) ✅
    → Phase 1 (multi-agent engine) ✅
        → Phase 1.5 (UI reorganization) ✅
            → Phase 2 (test suite API) ✅
                → Phase 3 (callback + results) ✅
                    → Phase 4 (metrics API) ✅
                        → Phase 5 (frontend polish) ✅
                            → Phase 6 (live view) ✅
                                → Phase 7 (demo prep) ← NEXT
```

## Cut Line

If time is running out, here's what to cut (in order):
1. **Phase 6** (live view) — nice-to-have, not core
2. **Phase 7** (polish) — reduce to just README + basic demo prep
3. **Phase 5** (frontend) — simplify to dashboard-only, skip test detail charts
4. **Phase 4** (metrics) — simplify to just `/results` and `/dashboard`

**Minimum viable demo:** Phases 0-3 + a basic dashboard showing test results.

---

## Progress Log

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 | ✅ Complete | Replit agent delivered backend + frontend scaffold beyond plan |
| Phase 1 | ✅ Complete | All 3 agents (Planner/Browser/Evaluator), pipeline, TinyFish service, CLI + API integration |
| Phase 1.5 | ✅ Complete | Sidebar nav, 4 pages (Dashboard/Tests/Run Test/Settings), CodeRabbit-style layout |
| Phase 2 | ✅ Complete | Full CRUD + QStash lifecycle + Tests page UI + dashboard metrics |
| Phase 3 | ✅ Complete | QStash callback + result persistence + alert webhooks + event logging |
| Phase 4 | ✅ Complete | 6 read endpoints (results, timing, uptime, incidents, dashboard, SSE live) + import fix + QStash sig verification |
| Phase 5 | ✅ Complete | Dashboard wired to /api/dashboard, test detail page with chart/history/incidents, Run Now buttons |
| Phase 6 | ✅ Complete | Live execution panel with SSE, phase indicator, step tracker, browser preview, event log, animations |
| Phase 7 | 🔲 Next | Demo prep |
