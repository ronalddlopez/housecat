# HouseCat

**AI-powered QA testing platform.** Describe tests in plain English, and AI agents plan, execute, and evaluate them automatically.

Built for the [Online Open Source Agents Hackathon](https://lu.ma/agents-hackathon-online) (February 2026).

---

## What It Does

HouseCat lets you monitor any website by describing what to test in natural language:

> *"Go to the homepage, verify the navigation bar has a Login link, click it, and confirm the login form loads with email and password fields."*

Three AI agents handle the rest:

1. **Planner Agent** (Claude Haiku 4.5) — Breaks your description into discrete, executable test steps
2. **Browser Agent** (TinyFish) — Executes each step in a real browser, interacting with the page visually
3. **Evaluator Agent** (Claude Haiku 4.5) — Compares what happened vs. what was expected and delivers a pass/fail verdict

Tests run on a schedule (cron via QStash), capture before/after screenshots, stream live browser previews, and send failure alerts to webhooks (Slack, Discord, etc.).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  React + Vite + TailwindCSS + shadcn/ui             │
│  Dashboard · Test Management · Live Execution Panel │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│  FastAPI Backend                                     │
│                                                      │
│  ┌─────────┐   ┌──────────┐   ┌───────────┐        │
│  │ Planner │──▶│ Browser  │──▶│ Evaluator │        │
│  │ Agent   │   │ Agent    │   │ Agent     │        │
│  └────┬────┘   └────┬─────┘   └─────┬─────┘        │
│       │             │               │               │
│  Claude Haiku   TinyFish API   Claude Haiku         │
│  (pydantic-ai)  (SSE stream)   (pydantic-ai)        │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Upstash Redis    QStash       Playwright
   (state store)  (scheduler)  (screenshots)
```

### Agent Pipeline

Each test run follows this pipeline:

```
create_plan(url, goal)
  → for each step:
      execute_step(url, step)     # TinyFish browser automation
      capture_screenshot()         # Playwright screenshot
  → evaluate_test(goal, results)  # Claude synthesizes verdict
  → store results in Redis
```

- **Planner** uses structured output (`pydantic-ai` → `TestPlan` model) to generate self-contained steps with TinyFish-compatible goals
- **Browser** calls TinyFish per step via SSE, capturing streaming URLs for live preview and raw JSON results
- **Evaluator** receives all step results and produces a `TestResult` with per-step breakdown, overall pass/fail, and human-readable details
- **Screenshots** are captured via Playwright (singleton browser) before the first step and after each step

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, shadcn/ui, TanStack Query, wouter |
| Backend | FastAPI, Python 3.11+ |
| AI Agents | pydantic-ai with Claude Haiku 4.5 (Anthropic) |
| Browser Automation | TinyFish API (SSE streaming) |
| Screenshots | Playwright |
| State Storage | Upstash Redis (Hash, Sorted Set, Stream, List) |
| Scheduling | QStash (cron-based callbacks) |
| Deployment | Replit |

## Features

- **Natural language tests** — Describe what to test, not how to test it
- **Scheduled monitoring** — Cron schedules from every 5 minutes to daily
- **Live browser preview** — Watch TinyFish browse in real-time via streaming URL
- **Before/after screenshots** — Visual comparison of page state
- **Per-step execution** — Each step runs independently with its own TinyFish session
- **Failure alerts** — Webhook notifications (Slack, Discord) on test failures
- **Rich run details** — Summary, screenshots, raw JSON, and plan tabs per run
- **Dashboard** — Site health, attention needed, coverage stats, inline test creation
- **SSE live events** — Real-time pipeline progress streamed to the UI

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Upstash Redis](https://upstash.com/) account (free tier works)
- [QStash](https://upstash.com/docs/qstash) account (for scheduled tests)
- [Anthropic API key](https://console.anthropic.com/) (Claude Haiku 4.5)
- [TinyFish API key](https://agent.tinyfish.ai/) (browser automation)

### Environment Variables

Create a `.env` file in the root:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
TINYFISH_API_KEY=tf_...
UPSTASH_REDIS_URL=https://...upstash.io
UPSTASH_REDIS_TOKEN=AX...

# QStash (for scheduled tests)
QSTASH_TOKEN=ey...
QSTASH_CURRENT_SIGNING_KEY=sig_...
QSTASH_NEXT_SIGNING_KEY=sig_...
REPLIT_DEV_DOMAIN=your-app.replit.dev  # or PUBLIC_URL for non-Replit deployments
```

### Install & Run

```bash
# Backend
cd backend
pip install -r requirements.txt  # or: uv sync
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
npm install
npm run dev
```

The app runs on port 5000 (Vite dev server proxies API requests to the backend on port 8000).

### Quick Test

Once running, navigate to **Run Test** in the sidebar:
1. Enter a URL (e.g., `https://example.com`)
2. Describe what to test (e.g., *"Verify the page has a heading that says 'Example Domain' and a link that says 'More information...'"*)
3. Click **Run Test** and watch the live execution panel

## Project Structure

```
housecat/
├── backend/
│   ├── agents/
│   │   ├── pipeline.py      # Orchestrator — runs planner → browser → evaluator
│   │   ├── planner.py       # Claude Haiku agent → TestPlan structured output
│   │   ├── browser.py       # TinyFish caller → StepExecution per step
│   │   └── evaluator.py     # Claude Haiku agent → TestResult verdict
│   ├── api/
│   │   ├── tests.py         # CRUD + run endpoints for test suites
│   │   └── results.py       # Results, timing, uptime, incidents, SSE, dashboard
│   ├── services/
│   │   ├── tinyfish.py       # TinyFish SSE client
│   │   ├── screenshot.py     # Playwright screenshot capture
│   │   ├── config.py         # Redis, QStash, URL config
│   │   ├── test_suite.py     # Test suite CRUD (Redis-backed)
│   │   ├── result_store.py   # Run result storage (Redis sorted sets)
│   │   └── alert.py          # Webhook alert sender
│   ├── models.py             # Pydantic models (TestPlan, StepExecution, TestResult, etc.)
│   └── main.py               # FastAPI app, routes, QStash callback handler
├── client/
│   └── src/
│       ├── pages/
│       │   ├── dashboard.tsx      # Stats cards + inline create form
│       │   ├── tests.tsx          # Test suite list + CRUD dialogs
│       │   ├── test-detail.tsx    # Run history + rich run detail panel
│       │   ├── run-test.tsx       # One-off test runner
│       │   └── settings.tsx       # Health checks + connection status
│       ├── components/
│       │   ├── live-execution-panel.tsx  # Real-time SSE pipeline viewer
│       │   ├── test-form.tsx             # Shared create/edit form
│       │   └── app-sidebar.tsx           # Navigation sidebar
│       └── lib/
│           └── queryClient.ts     # TanStack Query setup + API helpers
└── pyproject.toml
```

## How It Works (Detailed)

### 1. Planning

The Planner Agent receives your URL + natural language goal and outputs a `TestPlan` with:
- A combined `tinyfish_goal` (for display)
- Individual `steps`, each with its own self-contained `tinyfish_goal`

Each step's goal is written so TinyFish can execute it in a **fresh browser session** — no state carries over between steps.

### 2. Execution

For each step, the pipeline:
1. Calls TinyFish via SSE with the step's URL + goal
2. Streams live browser preview URL to the frontend
3. Parses the TinyFish result JSON (success, action_performed, verification, error)
4. Captures a Playwright screenshot of the page after the step
5. Builds a `StepExecution` record with all raw + parsed data

### 3. Evaluation

The Evaluator Agent receives all step results and the original goal, then produces:
- Overall pass/fail
- Per-step breakdown
- Human-readable summary (1-3 sentences)
- Duration in milliseconds

### 4. Storage & Display

Results are stored in Upstash Redis:
- `results:{test_id}` — Sorted set of full run records (by timestamp)
- `timing:{test_id}` — Sorted set of duration data
- `incidents:{test_id}` — List of failure incidents
- `events:{test_id}` — Stream for real-time SSE events
- `test:{test_id}` — Hash with test suite metadata

The frontend renders rich run details with tabs: Summary, Screenshots, Raw JSON, and Plan.

## Hackathon Context

Built in 36 hours for the **Online Open Source Agents Hackathon** (February 14-15, 2026). The core thesis: QA testing shouldn't require writing Selenium scripts or Cypress tests. Describe what you want to verify, and let AI agents handle the browser automation, evaluation, and monitoring.

### What Makes This an "Agent" Project

HouseCat isn't a wrapper around a single API call. It's a **multi-agent pipeline** where:
- Each agent has a specialized role (plan, execute, evaluate)
- Agents communicate through structured Pydantic models
- The pipeline orchestrates them with error handling, screenshots, and real-time streaming
- The system runs autonomously on a schedule, alerting humans only when something breaks

## License

MIT
