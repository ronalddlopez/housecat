# HouseCat

**AI-powered QA testing platform.** Describe tests in plain English, and AI agents plan, execute, and evaluate them automatically.

Built for the [Online Open Source Agents Hackathon](https://lu.ma/agents-hackathon-online) (February 2026).

---

## What It Does

HouseCat lets you monitor any website by describing what to test in natural language:

> *"Go to the homepage, verify the navigation bar has a Login link, click it, and confirm the login form loads with email and password fields."*

Three AI agents handle the rest:

1. **Planner Agent** (Claude Haiku 4.5) — Breaks your description into numbered, sequential browser automation steps
2. **Browser Agent** (TinyFish) — Executes all steps in a single continuous browser session, interacting with the page visually
3. **Evaluator Agent** (Claude Haiku 4.5) — Compares what happened vs. what was expected and delivers a pass/fail verdict

Tests run on a schedule (cron via QStash), stream live execution progress to the UI, and send failure alerts to webhooks (Slack, Discord, etc.).

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
              ┌────────┴────────┐
              ▼                 ▼
         Upstash Redis       QStash
         (state store)     (scheduler)
```

### Agent Pipeline

Each test run follows this pipeline:

```
create_plan(url, goal)
  → call_tinyfish(url, combined_goal)   # Single continuous browser session
  → parse per-step results from TinyFish response
  → evaluate_test(goal, results)        # Claude synthesizes verdict
  → store results in Redis
```

- **Planner** uses structured output (`pydantic-ai` → `TestPlan` model) to generate sequential steps that build on each other within a single browser session
- **Browser** calls TinyFish once via SSE with the combined goal, streaming real-time progress events to the frontend
- **Evaluator** receives a summarized view of step results and produces a `TestResult` with per-step breakdown, overall pass/fail, and human-readable details

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, shadcn/ui, TanStack Query, wouter |
| Backend | FastAPI, Python 3.11+ |
| AI Agents | pydantic-ai with Claude Haiku 4.5 (Anthropic) |
| Browser Automation | TinyFish API (SSE streaming, single continuous session) |
| Auth | Clerk (free tier, email + password) |
| State Storage | Upstash Redis (Hash, Sorted Set, Stream, List) |
| Scheduling | QStash (cron-based callbacks) |
| Deployment | Replit |

## Features

- **Natural language tests** — Describe what to test, not how to test it
- **Scheduled monitoring** — Cron schedules from every 5 minutes to daily
- **Live execution tracking** — Real-time step-by-step progress with phase indicators and event log
- **Single-session execution** — All steps run in one continuous TinyFish browser session
- **Failure alerts** — Webhook notifications (Slack, Discord) on test failures
- **Rich run details** — Summary, per-step breakdown, raw JSON, and plan tabs per run
- **Dashboard** — Site health, attention needed, coverage stats, inline test creation
- **Authentication** — Clerk-powered sign-in/sign-up with user sync to Redis
- **SSE live events** — Real-time pipeline progress streamed to the UI

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Upstash Redis](https://upstash.com/) account (free tier works)
- [QStash](https://upstash.com/docs/qstash) account (for scheduled tests)
- [Anthropic API key](https://console.anthropic.com/) (Claude Haiku 4.5)
- [TinyFish API key](https://agent.tinyfish.ai/) (browser automation)
- [Clerk](https://clerk.com/) account (free tier, for authentication)

### Environment Variables

Create a `.env` file in the root:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
TINYFISH_API_KEY=tf_...
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...

# QStash (for scheduled tests)
QSTASH_TOKEN=ey...
QSTASH_CURRENT_SIGNING_KEY=sig_...
QSTASH_NEXT_SIGNING_KEY=sig_...

# Clerk (authentication)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Public URL
REPLIT_DEV_DOMAIN=your-app.replit.dev  # or PUBLIC_URL for non-Replit deployments
```

### Install & Run

```bash
# Install dependencies
npm install
pip install -r backend/requirements.txt

# Start development (Express + FastAPI + Vite HMR)
npm run dev
```

The app runs on port 5000. Express serves the Vite frontend and proxies `/api/*` to the FastAPI backend on port 8000.

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
│   │   ├── pipeline.py      # Orchestrator — single TinyFish call, then evaluate
│   │   ├── planner.py       # Claude Haiku agent → TestPlan structured output
│   │   ├── browser.py       # TinyFish caller → StepExecution (legacy per-step)
│   │   └── evaluator.py     # Claude Haiku agent → TestResult verdict
│   ├── api/
│   │   ├── tests.py         # CRUD + run endpoints for test suites
│   │   ├── results.py       # Results, timing, uptime, incidents, SSE, dashboard
│   │   └── auth.py          # Clerk user sync endpoint
│   ├── services/
│   │   ├── tinyfish.py       # TinyFish SSE client with streaming URL callback
│   │   ├── config.py         # Redis, QStash, URL config
│   │   ├── test_suite.py     # Test suite CRUD (Redis-backed)
│   │   ├── result_store.py   # Run result storage (Redis sorted sets)
│   │   └── alert.py          # Webhook alert sender
│   ├── models.py             # Pydantic models (TestPlan, StepExecution, TestResult, etc.)
│   └── main.py               # FastAPI app, routes, QStash callback handler
├── client/
│   └── src/
│       ├── pages/
│       │   ├── landing.tsx        # Public landing page
│       │   ├── dashboard.tsx      # Stats cards + inline create form
│       │   ├── tests.tsx          # Test suite list + CRUD dialogs
│       │   ├── test-detail.tsx    # Run history + rich run detail panel
│       │   ├── run-test.tsx       # One-off test runner
│       │   └── settings.tsx       # Health checks + connection status
│       ├── components/
│       │   ├── live-execution-panel.tsx  # Real-time SSE pipeline viewer
│       │   ├── protected-route.tsx      # Clerk auth guard
│       │   ├── test-form.tsx            # Shared create/edit form
│       │   └── app-sidebar.tsx          # Navigation sidebar
│       ├── hooks/
│       │   └── use-user-sync.ts   # Sync Clerk user to Redis
│       └── lib/
│           └── queryClient.ts     # TanStack Query setup + API helpers
├── server/
│   ├── index.ts              # Express 5 entry point (Clerk middleware, spawns FastAPI + Vite)
│   └── routes.ts             # Auth gate + proxy to FastAPI
└── pyproject.toml
```

## How It Works (Detailed)

### 1. Planning

The Planner Agent receives your URL + natural language goal and outputs a `TestPlan` with:
- A combined `tinyfish_goal` — the actual prompt sent to TinyFish with numbered STEP instructions
- Individual `steps` — for progress tracking in the UI

Steps are sequential and build on each other within one continuous browser session.

### 2. Execution

The pipeline makes a single TinyFish API call with the combined goal:
1. TinyFish opens a real browser and executes all steps in sequence
2. SSE events stream progress to the frontend (planning → browsing → evaluating phases)
3. The TinyFish result JSON is parsed to build per-step pass/fail data
4. A `StepExecution` record is created for each step with parsed results

### 3. Evaluation

The Evaluator Agent receives a summarized view of step results and the original goal, then produces:
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
- `user:{userId}` — Hash with Clerk user data

The frontend renders rich run details with tabs: Summary, Raw JSON, and Plan.

## Hackathon Context

Built in 36 hours for the **Online Open Source Agents Hackathon** (February 14-15, 2026). The core thesis: QA testing shouldn't require writing Selenium scripts or Cypress tests. Describe what you want to verify, and let AI agents handle the browser automation, evaluation, and monitoring.

### What Makes This an "Agent" Project

HouseCat isn't a wrapper around a single API call. It's a **multi-agent pipeline** where:
- Each agent has a specialized role (plan, execute, evaluate)
- Agents communicate through structured Pydantic models
- The pipeline orchestrates them with error handling and real-time streaming
- The system runs autonomously on a schedule, alerting humans only when something breaks

## License

MIT
