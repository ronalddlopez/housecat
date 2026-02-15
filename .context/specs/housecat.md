# HouseCat — CodeRabbit for QA

## The Idea

An AI agent that tests your web application like a real user — not just pinging URLs, but actually navigating pages, filling forms, clicking buttons, and verifying workflows work. Autonomous QA powered by AI agents that understand your app.

**One-liner:** "CodeRabbit for QA — describe tests in plain English and AI agents run them in a real browser on a schedule."

---

## Why This Exists

**AI-forward teams are shipping faster than ever.** Solo developers and small teams using Claude Code, Cursor, and Copilot can build full applications — but QA is still the gap. You can ship code in minutes, but who tests it?

Traditional uptime monitors ping a URL and check for a 200 response. That tells you the server is up — it doesn't tell you the login form works, the checkout flow completes, or the dashboard loads after authentication.

Synthetic monitoring tools (Datadog, Checkly, Pingdom) solve this, but require you to write and maintain brittle Playwright/Selenium scripts. Every UI change breaks them. Solo devs and small teams don't have time for that.

HouseCat replaces scripts with natural language. Describe what a user would do, and AI agents execute it in a real browser on a schedule. If something breaks, you get alerted with context — not just "test failed" but "the login button was present but clicking it returned a 500 error on the dashboard page."

**CodeRabbit reviews your code. HouseCat tests your app.**

---

## Hackathon Context

**Event:** February 2026 Online Open Source Agents Hackathon (r/AI_Agents, 200k+ members)
**Time:** 36 hours (2/14 9am PST → 2/15 9pm PST)
**Goal:** Build an AI Agent that can scale into a real business
**Open source required**

### Prize Targeting

| Prize | How HouseCat Qualifies |
|-------|----------------------|
| **Main prize** — 30k investment interview | $3B+ synthetic monitoring market. Clear customers (DevOps, SREs, QA). Recurring revenue model. |
| **TinyFish cash prizes** | TinyFish IS the testing engine. Interactive browser flows (login, checkout, form submission) are the highest-value use case for their technology. |
| **Redis 10k credits** | Redis is the entire data layer — time-series metrics, event streams, test history, real-time dashboard, alert state. |

---

## What Impresses the Sponsors

### TinyFish — This Is Their Dream Use Case

Most hackathon projects will scrape a webpage once. HouseCat uses TinyFish for **interactive multi-step browser flows on a recurring schedule** — the most advanced and impressive usage pattern:

- **Actions, not just reading** — filling login forms, clicking buttons, completing checkout flows
- **Verification** — the agent doesn't just act, it verifies the result ("did the dashboard actually load after login?")
- **Scheduled recurring usage** — TinyFish runs every 15 minutes, not once. Shows it as infrastructure.
- **Multi-step reasoning** — agent navigates login → dashboard → specific feature, making decisions at each step
- **Live browser preview** — judges watch a real browser testing an app in real-time

### Redis/Upstash — Deep Architectural Usage

Not just `SET`/`GET`. Redis is the entire backend data store:

- **Sorted Sets** — response time history with timestamps. Query: "average login time over the last 24 hours." This is time-series data done properly in Redis.
- **Streams** — every test step is an event in a Redis Stream. The frontend consumes it in real-time. Proper event-driven architecture.
- **Hashes** — test suite definitions, test result snapshots, incident details. Structured data without Postgres.
- **Pub/Sub** — agent publishes progress, dashboard subscribes and renders live. No polling.
- **Key Expiry (TTL)** — auto-cleanup of old test results. Self-managing data lifecycle.
- **QStash Cron** — most frequent usage of any idea (every 15 min). Shows QStash as production scheduling infrastructure.
- **QStash Retries** — if a test fails, QStash retries the callback. Built-in reliability.

---

## Architecture

```
                        ┌─────────────────────┐
                        │   React Dashboard   │
                        │  (Vite + Tailwind)  │
                        └──────────┬──────────┘
                                   │ HTTP + SSE
                                   │
                        ┌──────────▼──────────┐
                        │   FastAPI Backend   │
                        │   (single server)   │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────────────────┐
             │ Upstash Redis│ │  QStash │ │  Multi-Agent System     │
             │ (all state)  │ │ (cron)  │ │  (Pydantic AI + Claude) │
             └──────────────┘ └────┬────┘ └──────┬──────────────────┘
                                   │              │
                              scheduled      ┌────┴────────────────┐
                              callbacks      │                     │
                                   │    ┌────▼─────┐  ┌───────────▼──────────┐
                                   │    │ Planner  │  │ Evaluator Agent      │
                                   │    │ Agent    │  │ (synthesize results) │
                                   │    └────┬─────┘  └──────────────────────┘
                                   │         │ test steps
                                   │    ┌────▼──────────────┐
                                   │    │ Browser Agent     │
                                   │    │ (multi-step exec) │
                                   └────┤ ↕ TinyFish calls  │
                                        │ ↕ retry/adapt     │
                                        └───────────────────┘
```

### Request Flow

```
1. User creates a test suite via Dashboard
     - Name: "Production Login Flow"
     - URL: myapp.com/login
     - Goal: "Enter test@example.com / password123, click Login, verify the dashboard loads"
     - Schedule: every 15 minutes
     - Alert: Slack webhook on failure

2. FastAPI stores test suite in Redis, registers QStash cron schedule

3. Every 15 min, QStash calls POST /api/callback/{test_id}

4. Callback handler starts the multi-agent pipeline:

     STEP 1 — Planner Agent:
     - Receives: test URL + goal in natural language
     - Decomposes into discrete test steps:
       → Step 1: "Navigate to myapp.com/login and verify the login form is visible"
       → Step 2: "Enter test@example.com in email field and password123 in password field"
       → Step 3: "Click the Login button"
       → Step 4: "Verify the dashboard page loads with a welcome message"
     - Returns: TestPlan (list of ordered steps with success criteria)

     STEP 2 — Browser Agent (executes each step):
     - For each step in the plan:
       → Calls TinyFish browse tool with step-specific goal
       → Evaluates the result — did this step succeed?
       → If step fails: retries with adapted approach (e.g., different selector)
       → Logs each step result to Redis Stream (live view)
     - Makes multiple TinyFish calls — one per step, plus retries
     - Returns: list of StepResult objects

     STEP 3 — Evaluator Agent:
     - Receives: original goal + all step results
     - Synthesizes overall assessment: did the full workflow pass?
     - Generates detailed report with per-step breakdown
     - Returns: validated TestResult

5. Result stored in Redis (sorted set for timing, stream for events)

6. IF failure:
     - Evaluator calls: http_request(slack_webhook, alert payload with details)
     - Stores incident in Redis with step-level failure context

7. Dashboard shows: uptime %, response time chart, test history, live execution, incidents
```

---

## Agent Design — Multi-Agent Pipeline (Pydantic AI)

### Why Multi-Agent?

A single agent calling TinyFish once is just an API wrapper. Judges at an agent hackathon want to see **reasoning, planning, iteration, and adaptation**. Our multi-agent pipeline creates visible agentic behavior:

- **Planner Agent** — decomposes a high-level goal into discrete test steps (reasoning)
- **Browser Agent** — executes steps sequentially, retries on failure, adapts approach (iteration)
- **Evaluator Agent** — synthesizes results into a detailed assessment (judgment)

This means 5-15 LLM calls per test run with reasoning between each, not a single fire-and-forget API call.

### Framework

**Pydantic AI** — a Python agent framework by the Pydantic team (same ecosystem as FastAPI). Handles the tool-use loop automatically, returns validated Pydantic models, supports agent delegation (one agent calls another as a tool), and integrates natively with async FastAPI endpoints.

- `pip install "pydantic-ai-slim[anthropic]"`
- Uses existing `ANTHROPIC_API_KEY` env var — no additional setup

### Structured Output Models

```python
from pydantic import BaseModel, Field

class TestStep(BaseModel):
    step_number: int
    description: str = Field(description='What to do in this step')
    success_criteria: str = Field(description='How to know this step passed')

class TestPlan(BaseModel):
    steps: list[TestStep]
    total_steps: int

class StepResult(BaseModel):
    step_number: int
    passed: bool
    details: str
    retry_count: int = 0

class TestResult(BaseModel):
    passed: bool
    duration_ms: int
    steps_passed: int
    steps_total: int
    details: str = Field(description='Overall assessment of the test')
    step_results: list[StepResult] = Field(description='Per-step breakdown')
    error: str | None = Field(default=None, description='Error details if failed')
```

### Agent 1: Planner

Decomposes a natural language test goal into discrete, ordered steps.

```python
planner_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestPlan,
    instructions="""You are a QA test planner. Given a URL and a test goal in natural language,
break it down into discrete, ordered test steps. Each step should be a single browser action
or verification that can be executed independently.

Keep steps atomic — one action per step. Include success criteria for each step.
Typical tests have 3-6 steps. Never exceed 8 steps.""",
)
```

### Agent 2: Browser (with Tools)

Executes individual test steps using TinyFish. This is the agent with tools — it calls TinyFish multiple times (once per step, plus retries) and logs progress to Redis Streams.

```python
@dataclass
class BrowserDeps:
    redis: Redis
    test_id: str

browser_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    deps_type=BrowserDeps,
    output_type=StepResult,
    instructions="""You are a browser testing agent. You execute a single test step using the
browse tool. If the step fails, try a different approach (e.g., different wording, alternative
navigation path). You have up to 2 retries per step.

Evaluate the browse result against the success criteria to determine if the step passed.""",
)

@browser_agent.tool_plain
async def browse(url: str, goal: str) -> str:
    """Navigate to a URL in a real browser and perform actions described in the goal.

    Args:
        url: The URL to navigate to
        goal: What to do on the page (e.g., "click login button", "verify dashboard loads")
    """
    result = await call_tinyfish(url, goal)
    return json.dumps(result)
```

### Agent 3: Evaluator

Synthesizes all step results into a final test verdict with detailed reporting.

```python
evaluator_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestResult,
    instructions="""You are a QA evaluator. You receive the original test goal and results from
each test step. Synthesize an overall assessment:

- Did the full workflow pass? (all steps must pass for overall pass)
- What was the step-by-step breakdown?
- If something failed, what specifically went wrong and at which step?

If an alert webhook is provided and the test failed, use http_request to send the alert.""",
)

@evaluator_agent.tool_plain
async def http_request(url: str, method: str = "GET", body: str = "") -> str:
    """Make an HTTP request. Used for sending alert webhooks on test failure.

    Args:
        url: The URL to request
        method: HTTP method (GET, POST, PUT, DELETE)
        body: Optional JSON body for POST/PUT
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(method, url, content=body)
        return json.dumps({"status_code": response.status_code, "body": response.text[:1000]})
```

### Orchestration — The Pipeline

```python
async def run_test(url: str, goal: str, deps: BrowserDeps, alert_webhook: str | None) -> TestResult:
    start = time.time()

    # Step 1: Planner decomposes the goal
    plan_result = await planner_agent.run(
        f'URL: {url}\nGoal: {goal}',
        usage_limits=UsageLimits(request_limit=3),
    )
    plan = plan_result.output  # TestPlan

    # Step 2: Browser agent executes each step
    step_results = []
    for step in plan.steps:
        # Log step start to Redis Stream (for live view)
        await deps.redis.xadd(f"events:{deps.test_id}", "*", {
            "type": "step_start",
            "step": str(step.step_number),
            "description": step.description,
        })

        result = await browser_agent.run(
            f'URL: {url}\nStep: {step.description}\nSuccess criteria: {step.success_criteria}',
            deps=deps,
            usage_limits=UsageLimits(request_limit=4),  # allows retries
        )
        step_results.append(result.output)

        # Log step result to Redis Stream
        await deps.redis.xadd(f"events:{deps.test_id}", "*", {
            "type": "step_complete",
            "step": str(step.step_number),
            "passed": str(result.output.passed),
            "details": result.output.details,
        })

    # Step 3: Evaluator synthesizes final result
    eval_prompt = f'URL: {url}\nOriginal Goal: {goal}\n'
    eval_prompt += f'Alert Webhook: {alert_webhook}\n' if alert_webhook else ''
    eval_prompt += f'Step Results:\n{json.dumps([r.model_dump() for r in step_results], indent=2)}'

    eval_result = await evaluator_agent.run(
        eval_prompt,
        usage_limits=UsageLimits(request_limit=3),
    )

    # Inject timing
    final = eval_result.output
    final.duration_ms = int((time.time() - start) * 1000)
    return final
```

### Streaming (for Live View)

Each agent's execution streams events to Redis in real-time. The live view shows:
- Planner thinking through steps
- Browser agent executing each step with TinyFish live preview
- Evaluator synthesizing the final verdict

```python
# Each agent step is logged to Redis Stream
# Frontend consumes via SSE endpoint:
async def live_stream(test_id: str):
    last_id = "0-0"
    while True:
        events = redis.xread({f"events:{test_id}": last_id}, count=10)
        for event in events:
            yield f"data: {json.dumps(event)}\n\n"
            last_id = event["id"]
        await asyncio.sleep(1)
```

---

## Data Model (Redis-Only)

```python
# Test suite definition
test:{id} = HASH {
    "id": "uuid",
    "name": "Production Login Flow",
    "url": "https://myapp.com/login",
    "goal": "Enter test@example.com / password123, click Login, verify dashboard loads",
    "schedule": "*/15 * * * *",          # cron expression
    "alert_webhook": "https://hooks.slack.com/...",
    "created_at": "2026-02-14T09:00:00Z"
}

# Test result history (sorted set — score is timestamp)
results:{test_id} = ZSET {
    score: 1739520000,                    # unix timestamp
    member: JSON {
        "passed": true,
        "duration_ms": 3200,
        "details": "Dashboard loaded, saw 'Welcome back' heading",
        "timestamp": "2026-02-14T12:00:00Z"
    }
}

# Response time tracking (sorted set — score is timestamp, member is duration)
timing:{test_id} = ZSET {
    score: 1739520000,                    # unix timestamp
    member: "3200"                        # duration_ms
}

# Live execution events (stream)
events:{test_id} = STREAM {
    id: "1739520000000-0",
    fields: {
        "type": "step",                   # step | pass | fail | alert
        "message": "Entering credentials...",
        "timestamp": "2026-02-14T12:00:01Z"
    }
}

# Active incidents
incidents:{test_id} = LIST [
    JSON {
        "started_at": "2026-02-14T12:00:00Z",
        "error": "Dashboard returned 500 after login",
        "resolved_at": null
    }
]

# Index
tests:all = SET of test IDs
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | FastAPI (Python) | Fast to build, async support, single server |
| **Frontend** | React 19 + Vite + Tailwind + shadcn/ui | Familiar stack, fast to scaffold |
| **Database** | Upstash Redis | All state — no Postgres, no migrations, instant setup |
| **Scheduling** | QStash (Upstash) | Cron triggers, retries, callbacks — no worker process needed |
| **Browser Testing** | TinyFish API | Real browser automation via natural language |
| **Agent Framework** | Pydantic AI + Claude Haiku | Multi-agent pipeline (Planner → Browser → Evaluator), auto tool-use loop, structured output |
| **Deployment** | Replit | Instant public URL, zero deploy config, git-backed |

---

## Frontend Pages

### 1. Dashboard (Home)

- Overall health: X of Y tests passing
- Uptime percentages per test (calculated from Redis sorted set)
- Response time sparklines (last 24h from Redis sorted set)
- Recent failures with details
- Active incidents

### 2. Test Suite Manager

- List of all test suites
- Create/edit: name, URL, goal (textarea), schedule (dropdown: 15min/30min/1h/daily), alert webhook
- Per-test detail view: result history, response time chart, incident log

### 3. Live Execution View

- Real-time multi-agent activity (consumed from Redis Stream via SSE)
- Phase indicator: Planning → Executing Step N/M → Evaluating
- TinyFish live browser preview (embedded iframe from streaming URL)
- Step-by-step progress: each planned step shown with pass/fail as it executes
- Agent reasoning trace: see the planner decompose, browser agent act, evaluator assess

---

## API Endpoints

```
# Test suite CRUD
GET    /api/tests              — list all test suites
POST   /api/tests              — create test suite + register QStash cron
GET    /api/tests/{id}         — get test suite details
PUT    /api/tests/{id}         — update test suite
DELETE /api/tests/{id}         — delete test suite + remove QStash cron

# Results & metrics
GET    /api/tests/{id}/results — paginated test results (Redis ZRANGEBYSCORE)
GET    /api/tests/{id}/timing  — response time series (Redis ZRANGEBYSCORE)
GET    /api/tests/{id}/uptime  — uptime percentage over time window

# Execution
POST   /api/tests/{id}/run     — trigger a test manually (bypasses QStash)
GET    /api/tests/{id}/live    — SSE stream of current execution (Redis Stream)

# QStash callback
POST   /api/callback/{test_id} — QStash calls this on schedule, triggers agent

# Dashboard
GET    /api/dashboard          — aggregate health across all tests
```

---

## Demo Script (For Judges)

### Setup (before demo)
- Deploy to Replit with a public URL
- Create 2-3 test suites against a demo app (or a real public site)
- Let them run for a few cycles so there's history in Redis

### Live Demo (2-3 minutes)

1. **"This is HouseCat — CodeRabbit for QA."**
   Show the dashboard with green checks, uptime percentages, response time charts.

2. **"Traditional monitors ping a URL. HouseCat tests like a real user."**
   Open a test suite. Show the natural language goal: "Log in with test credentials, verify the dashboard loads."
   Click "Run Now."

3. **"Watch the agents work."**
   Switch to live view. First, the Planner Agent decomposes the goal into 4 steps. Then the Browser Agent executes each step — show the TinyFish browser preview navigating, entering credentials, clicking login. Each step shows pass/fail in real-time. Finally, the Evaluator Agent synthesizes the overall verdict.

4. **"It tracks everything in Redis."**
   Show the response time chart (Redis sorted sets). Show the event stream (Redis Streams). "Every test result, every timing metric, every step is stored and queryable."

5. **"Now let's break something."**
   Change the demo app to return a 500 on login (or change the test to an invalid URL). Run the test. Watch it fail. Show the Slack alert fire. Show the incident appear on the dashboard.

6. **"This runs every 15 minutes, autonomously."**
   Show the QStash cron schedule. "No scripts to maintain. No Playwright. No Selenium. Just describe what a user would do, and the agent handles the rest."

### Closing
"HouseCat replaces brittle test scripts with AI. Three specialized agents work together — a Planner decomposes your test, a Browser Agent executes each step in a real browser with retries, and an Evaluator synthesizes the verdict. Powered by Pydantic AI, TinyFish for browser automation, Redis for real-time streaming, and QStash for autonomous scheduling. It's the $3 billion synthetic monitoring market, reimagined."

---

## 36-Hour Build Plan

| Block | Hours | Deliverable |
|-------|-------|-------------|
| **Setup** | 2h | Fresh public repo, FastAPI + React scaffold, Upstash Redis + QStash accounts, TinyFish API key, Replit deploy |
| **Agent engine** | 6h | Multi-agent pipeline: Planner (TestPlan), Browser (StepResult + TinyFish), Evaluator (TestResult). Test end-to-end in terminal. |
| **Test suite API** | 3h | CRUD endpoints, Redis data model, QStash cron registration |
| **QStash callback** | 2h | Callback endpoint that triggers agent, stores results in Redis |
| **Frontend: dashboard** | 4h | Test list, uptime %, response time charts (recharts), health overview |
| **Frontend: test manager** | 3h | Create/edit test form, result history, timing chart |
| **Frontend: live view** | 3h | SSE consumption from Redis Stream, TinyFish iframe preview, step trace |
| **Polish & demo** | 2h | Error handling, loading states, README, demo setup, video |
| **Buffer** | ~11h | Sleep, debugging, unexpected issues |

### Build Order (Risk-First)

1. **Agent engine** — this is the core and riskiest piece. Build Planner → Browser → Evaluator pipeline. If the multi-agent loop works, everything else is CRUD.
2. **QStash callback** — prove the scheduled execution path works end-to-end.
3. **Redis data model** — store a few test results, query them back. Confirm the sorted set / stream patterns work.
4. **Frontend** — layer the UI on top of working APIs. Dashboard → test manager → live view.
5. **Polish** — only if there's time.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| TinyFish API goes down | Can't run tests | Mock mode with cached responses for demo |
| TinyFish is slow (30s+ per test) | Demo feels sluggish | Pre-run tests so history exists, do live demo on a fast-loading site |
| QStash callback needs public URL | Can't develop locally | Use ngrok for dev, Railway for demo |
| Claude API costs add up | Budget concern | Use Haiku, keep prompts concise, limit tool-use loop to 5 iterations |
| Redis data model issues | Data loss or wrong queries | Test sorted set queries early, keep schema simple |
| 36 hours isn't enough | Incomplete product | Cut live view first (nice-to-have), ship dashboard + test manager as MVP |

---

## What Makes This Win

1. **Visually impressive** — watching a real browser test your app live is something judges haven't seen
2. **Pushes TinyFish hard** — interactive flows, not just scraping. Their most advanced use case.
3. **Pushes Redis hard** — sorted sets, streams, pub/sub, hashes, TTL. It's the entire backend.
4. **Real business** — $3B synthetic monitoring market, clear customers (DevOps teams), recurring revenue
5. **Simple to explain** — "Describe a test in English, we run it in a real browser every 15 minutes"
6. **Truly agentic** — not a wrapper around an API. Three agents plan, execute iteratively, retry on failure, and synthesize results. 5-15 LLM calls per test with reasoning between each.
7. **Defensible** — the multi-agent pipeline adds intelligence that raw scripting tools can't match (self-healing tests, semantic verification, natural language test definitions)

---

## Prototype Test Notes (2026-02-14)

Issues discovered and fixed during the prototype test run. Keep these in mind during the hackathon build.

### 1. QStash Python SDK package name is `qstash`, not `upstash-qstash`

- **Wrong:** `pip install upstash-qstash==2.0.2` (doesn't exist on PyPI)
- **Right:** `pip install qstash` (latest v3.x)
- Import: `from qstash import QStash`

### 2. `qstash.schedule.create()` returns a string, not an object

```python
# Wrong — crashes with AttributeError
schedule = qstash.schedule.create(destination=url, cron=cron)
schedule.schedule_id  # ← doesn't exist

# Right — returns schedule ID directly as a string
schedule_id = qstash.schedule.create(destination=url, cron=cron)
```

### 3. Redis Streams require `upstash-redis` v1.6.0+

- v1.1.0 does **NOT** have stream commands — this caused the initial prototype to fall back to Lists
- **v1.6.0 adds:** `xadd`, `xrange`, `xread`, `xlen`, `xdel`, `xtrim`, consumer groups
- **Must use:** `pip install upstash-redis==1.6.0`
- Streams are available on the **free tier** — no paid plan required

### 4. `upstash-redis` Stream command signatures differ from standard Redis

```python
# xadd requires explicit "*" for auto-generated ID
redis.xadd("events:123", "*", {"type": "step", "message": "hello"})

# xrange uses positional args, not keyword args
redis.xrange("events:123", "-", "+", count=20)

# xread returns nested list, NOT a dict
results = redis.xread({"events:123": "0-0"}, count=10)
# Returns: [[stream_name, [[id, [k1,v1,k2,v2,...]], ...]], ...]

# Fields come back as flat lists — need helper to convert
def parse_stream_fields(flat_list):
    return dict(zip(flat_list[::2], flat_list[1::2]))

# xread has NO block parameter — Upstash REST API doesn't support blocking reads
# Use polling with asyncio.sleep(2) instead
```

### 5. QStash creates orphaned schedules if task creation fails mid-way

- If the QStash schedule is created but subsequent Redis writes fail, the schedule lives on in QStash with no matching Redis data
- **Fix:** Create Redis data **before** the QStash schedule, or wrap in try/except that deletes the schedule on failure

### 6. ngrok defaults to port 80 — must specify port 8000

- `ngrok http 8000` (not just `ngrok http`)
- Free tier URLs change on restart — update `.env` each time
- The `PUBLIC_URL` must NOT have a trailing slash

### 7. Data structures confirmed working

| Structure | Use Case | SDK Support (v1.6.0) | Status |
|-----------|----------|----------------------|--------|
| Hash (`hset`/`hgetall`) | Task/test definitions | Yes | Works great |
| Set (`sadd`/`smembers`) | Index of all task IDs | Yes | Works great |
| Sorted Set (`zadd`/`zrange`) | Time-series history | Yes | Works great |
| Stream (`xadd`/`xrange`/`xread`) | Event log + SSE | Yes (v1.6.0+) | Works — see gotchas in #4 |
| Pub/Sub | Real-time dashboard | Not tested | Test before relying on it |

### 8. Agent framework: Pydantic AI (multi-agent)

- **Chosen over:** raw Anthropic SDK (too manual), LangGraph (too heavy), Claude Agent SDK (alpha, Node.js dependency)
- **Install:** `pip install "pydantic-ai-slim[anthropic]"`
- Uses existing `ANTHROPIC_API_KEY` — no additional setup
- Handles tool-use loop automatically, returns validated Pydantic models
- **Multi-agent delegation:** one agent calls another via `@tool` function wrapping `child_agent.run()`
- **Architecture:** Planner Agent → Browser Agent (with TinyFish tool) → Evaluator Agent
- Each agent has its own `output_type` (TestPlan, StepResult, TestResult)
- `usage=ctx.usage` aggregates token costs across all agents
- Streaming via `run_stream_events()` for live execution view
