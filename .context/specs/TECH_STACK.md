# HouseCat — Tech Stack Guide

Built for speed: Redis-only database (no migrations), QStash for scheduling (no worker process), TinyFish for browser automation (no container management), and Replit for instant deployment.

---

## Stack Overview

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | FastAPI (Python) | Fast to build, async, single server |
| **Frontend** | React 19 + Vite + Tailwind + shadcn/ui | Familiar stack, fast to scaffold |
| **Database** | Upstash Redis (REST API) | No migrations, no ORM, instant setup, time-series built-in |
| **Scheduling** | QStash (Upstash) | Cron-as-a-service, auto-retry, no worker process |
| **Browser Automation** | TinyFish API | Real browser testing via natural language |
| **Agent Framework** | Pydantic AI + Claude Haiku | Multi-agent pipeline (Planner → Browser → Evaluator), structured output, agent delegation |
| **Deployment** | Replit | Instant public URL, zero deploy config |

---

## Backend — FastAPI (Python)

### Core Patterns
- FastAPI project structure (routes, schemas, services)
- Pydantic models for request/response validation
- Async endpoint handlers
- SSE (Server-Sent Events) for real-time streaming
- CORS middleware for frontend
- No database ORM — Redis is accessed directly via REST SDK
- No auth middleware — single-user hackathon build
- No background worker — QStash triggers execution via HTTP callbacks
- Small module structure — single `main.py` or a few focused modules

### Key Dependencies

```
fastapi==0.115.0
uvicorn==0.30.6
upstash-redis==1.6.0      # Redis client (REST-based, includes Streams)
qstash==3.2.0              # QStash client (cron scheduling)
pydantic-ai-slim[anthropic] # Agent framework with Claude support
httpx==0.27.2              # HTTP client for TinyFish SSE + alert webhooks
python-dotenv==1.0.1       # Environment variable loading
```

---

## Database — Upstash Redis

### Data Structures Used

| Structure | Use Case | How It Works |
|-----------|----------|-------------|
| **Hash** | Test suite definitions | Like a dictionary — `test:{id}` stores `{name, url, goal, ...}` as fields |
| **Set** | Index of all test IDs | `tests:all` — add/remove IDs as tests are created/deleted |
| **Sorted Set** | Time-series (results, timing) | Score=timestamp, member=JSON. Query by time range with `ZRANGEBYSCORE` |
| **Stream** | Event log (live execution) | Append-only, ordered. Agent logs steps, frontend reads in real-time |
| **List** | Active incidents | Simple push/pop for failure tracking |

### SDK Gotchas (from prototype testing)

```python
from upstash_redis import Redis

redis = Redis(url=os.environ["UPSTASH_REDIS_REST_URL"], token=os.environ["UPSTASH_REDIS_REST_TOKEN"])

# Hash — structured data, no schema needed
redis.hset("test:abc123", values={"name": "Login Flow", "url": "https://..."})
data = redis.hgetall("test:abc123")  # → dict

# Set — manual index of all IDs
redis.sadd("tests:all", "abc123")
all_ids = redis.smembers("tests:all")  # → set of strings

# Sorted Set — time-series data
redis.zadd("results:abc123", {json.dumps(result): time.time()})
recent = redis.zrange("results:abc123", 0, 9, rev=True)  # last 10

# Stream — append-only event log
# NOTE: xadd requires explicit "*" for auto-generated ID
redis.xadd("events:abc123", "*", {"type": "step", "message": "Navigating..."})
events = redis.xrange("events:abc123", "-", "+", count=20)
# Returns: [[id, [k1, v1, k2, v2, ...]], ...]
# Use helper to parse flat list to dict:
def parse_stream_fields(flat_list):
    return dict(zip(flat_list[::2], flat_list[1::2]))
```

### Free Tier Limits

- 256 MB data size
- 500K commands/month
- 10 GB monthly bandwidth
- All data structures available (Hash, Set, Sorted Set, Stream, List, etc.)
- Stream data stored on disk (doesn't count against 256 MB memory limit)

---

## Job Scheduling — QStash (Upstash)

### How It Works

- You register a cron schedule with a destination URL
- QStash POSTs to your endpoint on that schedule
- Your endpoint returns 200 (success) or 500 (failure)
- On failure, QStash auto-retries with exponential backoff
- No worker process to manage — QStash is fully external

### SDK Usage

```python
from qstash import QStash

client = QStash(token=os.environ["QSTASH_TOKEN"])

# Create cron schedule — returns schedule ID as a string (NOT an object)
schedule_id = client.schedule.create(
    destination=f"{PUBLIC_URL}/api/callback/{test_id}",
    cron="*/15 * * * *",
)

# Delete schedule
client.schedule.delete(schedule_id)
```

### Gotchas
- `schedule.create()` returns a **string** (the schedule ID), not an object
- Requires a **public URL** — QStash must reach your server over the internet
- Create Redis data **before** the QStash schedule to avoid orphaned schedules on failure
- Free tier: 500 messages/day, 5 schedules max (check current limits)

---

## Browser Automation — TinyFish API

### How It Works

- Send a URL + natural language goal to the TinyFish API
- TinyFish opens a real browser in the cloud and executes the goal
- Returns structured JSON result + a live browser preview URL
- Streams progress via SSE (Server-Sent Events) as the browser works

### API Usage

```python
import httpx

TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"

async def browse(url: str, goal: str) -> dict:
    """Call TinyFish to browse a URL and perform a goal."""
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", TINYFISH_URL, json={
            "url": url,
            "goal": goal,
        }, headers={
            "X-API-Key": os.environ["TINYFISH_API_KEY"],
            "Content-Type": "application/json",
        }) as response:
            result = None
            streaming_url = None

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = json.loads(line[6:])

                if data.get("type") == "STREAMING_URL":
                    streaming_url = data["streamingUrl"]
                elif data.get("type") == "COMPLETE":
                    result = data.get("resultJson")
                elif data.get("type") == "ERROR":
                    return {"success": False, "error": data.get("message")}

            return {
                "success": True,
                "data": result,
                "streaming_url": streaming_url,
            }
```

### SSE Event Types

| Event | What It Means | Key Fields |
|-------|--------------|------------|
| `STREAMING_URL` | Live browser preview URL (embeddable iframe) | `streamingUrl` |
| `STEP` | Agent progress update | `message`, `purpose`, `action` |
| `COMPLETE` | Done — result available | `status: "COMPLETED"`, `resultJson` |
| `ERROR` | Failed | `status: "FAILED"`, `message` |

### Options
- `browser_profile: "stealth"` — rotating proxies, anti-detection (for sites that block bots)
- `timeout` — max execution time in ms

---

## Agent Framework — Pydantic AI (Multi-Agent)

### Why Pydantic AI

- Built by the Pydantic team (same ecosystem as FastAPI)
- Handles the tool-use loop automatically — no manual while loop
- **Agent delegation** — one agent can call another via `@tool`, enabling multi-agent pipelines
- Structured output via Pydantic models with auto-validation + retry
- Type-safe dependency injection for passing Redis, config to tools
- Async-native — works naturally with FastAPI
- 14.9k GitHub stars, V1 stable, MIT license

### Multi-Agent Architecture

Three specialized agents form a pipeline — visible agentic behavior, not a wrapper around TinyFish:

```
Planner Agent (pure reasoning)
  → Decomposes "Test the login flow" into 4 discrete steps
  → Output: TestPlan (list of TestStep)

Browser Agent (tool-equipped)
  → Executes each step using TinyFish browse tool
  → Retries with adapted approach on failure
  → Output: StepResult per step

Evaluator Agent (tool-equipped)
  → Synthesizes all step results into overall verdict
  → Sends alert webhook on failure via http_request tool
  → Output: TestResult (final structured result)
```

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

### Agent Definitions

```python
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext, UsageLimits
from upstash_redis import Redis

@dataclass
class BrowserDeps:
    redis: Redis
    test_id: str

# Agent 1: Planner — decomposes goal into steps (no tools, pure reasoning)
planner_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestPlan,
    instructions="""You are a QA test planner. Break down a test goal into discrete,
ordered steps. Each step = one browser action or verification. 3-6 steps typical, max 8.""",
)

# Agent 2: Browser — executes one step at a time using TinyFish
browser_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    deps_type=BrowserDeps,
    output_type=StepResult,
    instructions="""You are a browser testing agent. Execute a single test step using the
browse tool. If it fails, retry with a different approach (up to 2 retries).""",
)

# Agent 3: Evaluator — synthesizes step results into final verdict
evaluator_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestResult,
    instructions="""You are a QA evaluator. Given the original goal and all step results,
synthesize an overall pass/fail verdict with detailed breakdown. Send alert webhook if failed.""",
)
```

### Tool Definitions

Tools are decorated functions on the agent that needs them. Schemas auto-generated from type hints + docstrings.

```python
@browser_agent.tool_plain
async def browse(url: str, goal: str) -> str:
    """Navigate to a URL in a real browser and perform actions described in the goal.

    Args:
        url: The URL to navigate to
        goal: What to do on the page (one specific action or verification)
    """
    result = await call_tinyfish(url, goal)
    return json.dumps(result)

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

    # Step 1: Planner decomposes the goal into steps
    plan = (await planner_agent.run(
        f'URL: {url}\nGoal: {goal}',
        usage_limits=UsageLimits(request_limit=3),
    )).output

    # Step 2: Browser agent executes each step sequentially
    step_results = []
    for step in plan.steps:
        await deps.redis.xadd(f"events:{deps.test_id}", "*", {
            "type": "step_start", "step": str(step.step_number),
            "description": step.description,
        })
        result = (await browser_agent.run(
            f'URL: {url}\nStep: {step.description}\nSuccess criteria: {step.success_criteria}',
            deps=deps,
            usage_limits=UsageLimits(request_limit=4),
        )).output
        step_results.append(result)

    # Step 3: Evaluator synthesizes final verdict
    eval_prompt = f'URL: {url}\nGoal: {goal}\nAlert: {alert_webhook or "none"}\n'
    eval_prompt += f'Results:\n{json.dumps([r.model_dump() for r in step_results], indent=2)}'
    final = (await evaluator_agent.run(
        eval_prompt, usage_limits=UsageLimits(request_limit=3),
    )).output
    final.duration_ms = int((time.time() - start) * 1000)
    return final
```

### Model Choice
- **Claude Haiku** for cost efficiency — multi-agent means more LLM calls (5-15 per test run)
- Each agent's task is focused and simple — doesn't need Sonnet/Opus reasoning power
- Uses existing `ANTHROPIC_API_KEY` — no additional setup
- `UsageLimits` on each agent prevents runaway loops

---

## Frontend — React 19 + Vite + Tailwind + shadcn/ui

### Core Setup
- React 19 with Vite for bundling
- Tailwind CSS for styling
- shadcn/ui component library (Button, Card, Input, Table, Dialog, etc.)
- React Router for page navigation
- recharts for charts (response time, uptime)
- SSE consumption for live execution view (`EventSource` API)
- TinyFish browser preview embed (iframe with `streamingUrl`)

### Pages
- **Dashboard** — health overview, test list with status, uptime %, response time sparklines
- **Test Manager** — create/edit test form, result history, timing chart
- **Live Execution View** — real-time agent activity, browser preview, step trace

### What's Not Included
- No auth (single-user hackathon build)
- No code editor
- 3 pages total — focused and minimal

---

## Deployment — Replit

### Why Replit
- Instant public URL — QStash can reach your server immediately
- Code in browser or git push → auto-deploy
- Single project runs both backend and frontend
- Auto-generated `.replit.app` URL

### Development Workflow

```
1. Create Replit project → get public URL immediately
2. git clone locally
3. Develop with Claude Code + Cursor (faster editing)
4. git push → Replit auto-deploys
5. QStash callbacks hit the Replit URL
```

### Key Consideration
- Replit free tier Repls go to sleep — need "Always On" or "Deployments" for QStash to reliably reach callbacks
- Alternative: Replit for frontend only, deploy backend to Railway (adds complexity)

---

## Environment Variables

```bash
# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...

# QStash
QSTASH_TOKEN=QSxx...
QSTASH_CURRENT_SIGNING_KEY=sig_xxx...
QSTASH_NEXT_SIGNING_KEY=sig_xxx...

# TinyFish
TINYFISH_API_KEY=sk-mino-xxxxx

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# App
PUBLIC_URL=https://your-app.replit.app
```
