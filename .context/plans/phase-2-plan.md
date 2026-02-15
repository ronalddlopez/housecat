# Phase 2: Test Suite API + Redis Data Model — Detailed Plan

**Goal:** CRUD endpoints for test suites backed by Redis, QStash cron registration for scheduled execution, and frontend wired up to create/manage tests from the Tests page.

**Where:** Replit (backend + frontend together) or Claude Code for backend, push to Replit.

---

## Overview

By the end of Phase 2:
1. You can create a test suite from the UI (name, URL, goal, schedule)
2. Tests are stored in Redis and listed on the Tests page
3. Each test has a QStash cron schedule that will trigger execution (Phase 3 wires up the actual execution)
4. You can edit, delete, and manually run tests from the UI

---

## Redis Key Schema

All application state lives in Redis. No SQL, no migrations.

```
test:{id}           → Hash    (test suite definition)
tests:all           → Set     (index of all test IDs)
results:{id}        → Sorted Set (Phase 3 — test results, score=timestamp)
timing:{id}         → Sorted Set (Phase 3 — response times, score=timestamp)
events:{id}         → Stream    (Phase 3 — execution event log)
incidents:{id}      → List      (Phase 3 — failure incidents)
```

### Test Suite Hash (`test:{id}`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID (generated server-side) |
| `name` | string | Human-readable name, e.g. "Login Flow" |
| `url` | string | Target URL to test |
| `goal` | string | Natural language test description |
| `schedule` | string | Cron expression, e.g. "*/15 * * * *" |
| `schedule_id` | string | QStash schedule ID (for updates/deletes) |
| `alert_webhook` | string | Optional — Slack/Discord webhook URL for failure alerts |
| `status` | string | "active", "paused", or "error" |
| `last_result` | string | "passed", "failed", or "pending" (updated by Phase 3) |
| `last_run_at` | string | ISO timestamp of last execution (updated by Phase 3) |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

**Note:** Redis Hashes store all values as strings. Serialize/deserialize as needed.

---

## File Structure

### New files:

```
backend/
├── models.py                ← existing, add TestSuite Pydantic models
├── services/
│   ├── tinyfish.py          ← existing
│   └── test_suite.py        ← NEW: Redis CRUD operations for test suites
├── api/
│   ├── __init__.py          ← NEW
│   └── tests.py             ← NEW: FastAPI router for /api/tests endpoints
└── main.py                  ← UPDATE: mount tests router
```

### Frontend updates:

```
client/src/
├── pages/
│   ├── tests.tsx            ← UPDATE: test list table + create dialog
│   ├── dashboard.tsx        ← UPDATE: wire up real test count metrics
│   └── run-test.tsx         ← UPDATE: option to save as test suite after running
└── lib/
    └── queryClient.ts       ← existing, no changes
```

---

## Step 1: Pydantic Models — Request/Response Schemas (`models.py`)

Add these to the existing `models.py` alongside the agent models:

```python
from pydantic import BaseModel, Field
from datetime import datetime

# --- Test Suite Schemas ---

class CreateTestSuite(BaseModel):
    """Request body for creating a test suite."""
    name: str = Field(min_length=1, max_length=100, description="Test suite name")
    url: str = Field(description="Target URL to test")
    goal: str = Field(min_length=1, description="Natural language test description")
    schedule: str = Field(default="*/15 * * * *", description="Cron expression for scheduling")
    alert_webhook: str | None = Field(default=None, description="Webhook URL for failure alerts")

class UpdateTestSuite(BaseModel):
    """Request body for updating a test suite. All fields optional."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    url: str | None = None
    goal: str | None = Field(default=None, min_length=1)
    schedule: str | None = None
    alert_webhook: str | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")

class TestSuiteResponse(BaseModel):
    """Response model for a test suite."""
    id: str
    name: str
    url: str
    goal: str
    schedule: str
    schedule_id: str | None = None
    alert_webhook: str | None = None
    status: str = "active"
    last_result: str = "pending"
    last_run_at: str | None = None
    created_at: str
    updated_at: str

class TestSuiteListResponse(BaseModel):
    """Response model for listing test suites."""
    tests: list[TestSuiteResponse]
    total: int
```

---

## Step 2: Test Suite Service — Redis CRUD (`services/test_suite.py`)

This is the data layer. All Redis operations for test suites live here.

```python
import os
import json
import uuid
from datetime import datetime, timezone
from upstash_redis import Redis
from qstash import QStash

def get_redis() -> Redis:
    return Redis(
        url=os.environ.get("UPSTASH_REDIS_REST_URL", ""),
        token=os.environ.get("UPSTASH_REDIS_REST_TOKEN", ""),
    )

def get_qstash() -> QStash:
    token = os.environ.get("QSTASH_TOKEN", "")
    url = os.environ.get("QSTASH_URL")
    if url:
        return QStash(token, base_url=url)
    return QStash(token)

def get_public_url() -> str:
    domain = os.environ.get("REPLIT_DEV_DOMAIN", "")
    if domain:
        return f"https://{domain}"
    return os.environ.get("PUBLIC_URL", "http://localhost:5000")


def create_test_suite(data: dict) -> dict:
    """Create a test suite in Redis and register QStash cron."""
    redis = get_redis()
    qstash = get_qstash()
    public_url = get_public_url()

    test_id = str(uuid.uuid4())[:8]  # short ID for readability
    now = datetime.now(timezone.utc).isoformat()

    test = {
        "id": test_id,
        "name": data["name"],
        "url": data["url"],
        "goal": data["goal"],
        "schedule": data.get("schedule", "*/15 * * * *"),
        "alert_webhook": data.get("alert_webhook") or "",
        "status": "active",
        "last_result": "pending",
        "last_run_at": "",
        "created_at": now,
        "updated_at": now,
        "schedule_id": "",  # set after QStash registration
    }

    # Step 1: Store in Redis FIRST (avoid orphaned QStash schedules)
    redis.hset(f"test:{test_id}", values=test)
    redis.sadd("tests:all", test_id)

    # Step 2: Register QStash cron schedule
    try:
        schedule_id = qstash.schedule.create(
            destination=f"{public_url}/api/callback/{test_id}",
            cron=test["schedule"],
        )
        # schedule.create() returns a string (schedule ID)
        if hasattr(schedule_id, "schedule_id"):
            schedule_id = schedule_id.schedule_id
        test["schedule_id"] = str(schedule_id)
        redis.hset(f"test:{test_id}", values={"schedule_id": test["schedule_id"]})
    except Exception as e:
        # QStash failed — mark test as error but don't delete Redis data
        test["status"] = "error"
        redis.hset(f"test:{test_id}", values={"status": "error"})
        print(f"QStash schedule creation failed for {test_id}: {e}")

    return test


def list_test_suites() -> list[dict]:
    """List all test suites from Redis."""
    redis = get_redis()
    test_ids = redis.smembers("tests:all")

    if not test_ids:
        return []

    tests = []
    for test_id in test_ids:
        data = redis.hgetall(f"test:{test_id}")
        if data:
            tests.append(data)

    # Sort by created_at descending (newest first)
    tests.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return tests


def get_test_suite(test_id: str) -> dict | None:
    """Get a single test suite by ID."""
    redis = get_redis()
    data = redis.hgetall(f"test:{test_id}")
    return data if data else None


def update_test_suite(test_id: str, updates: dict) -> dict | None:
    """Update a test suite. Handles QStash schedule changes."""
    redis = get_redis()
    qstash = get_qstash()
    public_url = get_public_url()

    existing = redis.hgetall(f"test:{test_id}")
    if not existing:
        return None

    # Filter out None values (only update provided fields)
    changes = {k: v for k, v in updates.items() if v is not None}
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    # If schedule changed, update QStash
    if "schedule" in changes and changes["schedule"] != existing.get("schedule"):
        old_schedule_id = existing.get("schedule_id")

        # Delete old schedule
        if old_schedule_id:
            try:
                qstash.schedule.delete(old_schedule_id)
            except Exception as e:
                print(f"Failed to delete old QStash schedule {old_schedule_id}: {e}")

        # Create new schedule
        try:
            new_schedule_id = qstash.schedule.create(
                destination=f"{public_url}/api/callback/{test_id}",
                cron=changes["schedule"],
            )
            if hasattr(new_schedule_id, "schedule_id"):
                new_schedule_id = new_schedule_id.schedule_id
            changes["schedule_id"] = str(new_schedule_id)
        except Exception as e:
            changes["status"] = "error"
            print(f"QStash schedule update failed for {test_id}: {e}")

    # If status changed to "paused", delete QStash schedule
    if changes.get("status") == "paused":
        schedule_id = existing.get("schedule_id")
        if schedule_id:
            try:
                qstash.schedule.delete(schedule_id)
                changes["schedule_id"] = ""
            except Exception as e:
                print(f"Failed to pause QStash schedule {schedule_id}: {e}")

    # If status changed to "active" from "paused", recreate QStash schedule
    if changes.get("status") == "active" and existing.get("status") == "paused":
        schedule = changes.get("schedule") or existing.get("schedule", "*/15 * * * *")
        try:
            new_schedule_id = qstash.schedule.create(
                destination=f"{public_url}/api/callback/{test_id}",
                cron=schedule,
            )
            if hasattr(new_schedule_id, "schedule_id"):
                new_schedule_id = new_schedule_id.schedule_id
            changes["schedule_id"] = str(new_schedule_id)
        except Exception as e:
            changes["status"] = "error"
            print(f"QStash schedule resume failed for {test_id}: {e}")

    redis.hset(f"test:{test_id}", values=changes)

    # Return updated test
    return redis.hgetall(f"test:{test_id}")


def delete_test_suite(test_id: str) -> bool:
    """Delete a test suite, its QStash schedule, and all related data."""
    redis = get_redis()
    qstash = get_qstash()

    existing = redis.hgetall(f"test:{test_id}")
    if not existing:
        return False

    # Delete QStash schedule
    schedule_id = existing.get("schedule_id")
    if schedule_id:
        try:
            qstash.schedule.delete(schedule_id)
        except Exception as e:
            print(f"Failed to delete QStash schedule {schedule_id}: {e}")

    # Delete Redis data
    redis.delete(f"test:{test_id}")
    redis.srem("tests:all", test_id)

    # Clean up related keys (Phase 3 data — safe to delete even if they don't exist yet)
    redis.delete(f"results:{test_id}")
    redis.delete(f"timing:{test_id}")
    redis.delete(f"events:{test_id}")
    redis.delete(f"incidents:{test_id}")

    return True
```

### Key Design Decisions

- **Short UUIDs** (`uuid4()[:8]`) — readable in URLs and Redis keys, collision risk is negligible for a hackathon
- **Redis before QStash** — always write to Redis first. If QStash fails, the test exists but is marked "error". If Redis fails, nothing is created. No orphaned QStash schedules.
- **QStash `schedule.create()` return type** — the SDK may return a string or an object with `.schedule_id`. Handle both defensively.
- **Pause/Resume** — pausing deletes the QStash schedule, resuming recreates it. Simpler than QStash pause APIs.
- **Delete cascades** — deleting a test cleans up all related Redis keys (results, timing, events, incidents).

---

## Step 3: API Router (`api/tests.py`)

FastAPI router with all CRUD endpoints.

```python
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from backend.models import CreateTestSuite, UpdateTestSuite, TestSuiteResponse
from backend.services.test_suite import (
    create_test_suite,
    list_test_suites,
    get_test_suite,
    update_test_suite,
    delete_test_suite,
)

router = APIRouter(prefix="/api/tests", tags=["tests"])


@router.post("")
async def create_test(request: Request):
    """Create a new test suite."""
    try:
        body = await request.json()
        # Validate with Pydantic
        data = CreateTestSuite(**body)
        test = create_test_suite(data.model_dump())
        return test
    except Exception as e:
        return JSONResponse(content={"error": str(e)[:300]}, status_code=400)


@router.get("")
async def list_tests():
    """List all test suites."""
    tests = list_test_suites()
    return {"tests": tests, "total": len(tests)}


@router.get("/{test_id}")
async def get_test(test_id: str):
    """Get a single test suite."""
    test = get_test_suite(test_id)
    if not test:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)
    return test


@router.put("/{test_id}")
async def update_test(test_id: str, request: Request):
    """Update a test suite."""
    try:
        body = await request.json()
        data = UpdateTestSuite(**body)
        test = update_test_suite(test_id, data.model_dump(exclude_unset=True))
        if not test:
            return JSONResponse(content={"error": "Test not found"}, status_code=404)
        return test
    except Exception as e:
        return JSONResponse(content={"error": str(e)[:300]}, status_code=400)


@router.delete("/{test_id}")
async def delete_test(test_id: str):
    """Delete a test suite and its QStash schedule."""
    deleted = delete_test_suite(test_id)
    if not deleted:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)
    return {"status": "deleted", "id": test_id}


@router.post("/{test_id}/run")
async def run_test_now(test_id: str):
    """Manually trigger a test run (bypasses QStash schedule)."""
    from backend.agents.pipeline import run_test

    test = get_test_suite(test_id)
    if not test:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)

    try:
        plan, browser_result, final_result = await run_test(test["url"], test["goal"])
        return {
            "plan": plan.model_dump(),
            "browser_result": browser_result.model_dump(),
            "result": final_result.model_dump(),
        }
    except Exception as e:
        return JSONResponse(content={"error": f"Pipeline failed: {str(e)[:300]}"}, status_code=500)
```

### Route Conflict Note

The existing `main.py` has `POST /api/tests/{test_id}/run` and `POST /api/tests/manual/run`. Once the router is mounted, these should be **removed from `main.py`** to avoid conflicts. The router handles both `POST /api/tests` (create) and `POST /api/tests/{test_id}/run` (manual trigger).

---

## Step 4: Mount Router in `main.py`

```python
# Add to main.py after app creation:
from backend.api.tests import router as tests_router
app.include_router(tests_router)

# REMOVE these existing endpoints from main.py:
# - POST /api/tests/{test_id}/run (moved to router)
# - POST /api/tests/manual/run (if it exists, replaced by router)
```

---

## Step 5: Frontend — Tests Page (`tests.tsx`)

Replace the empty state with a real test list and create dialog.

### Tests Page Layout

```
Tests                                    [+ New Test]
┌──────────────────────────────────────────────────────┐
│ Name           URL                Schedule    Status  │
│──────────────────────────────────────────────────────│
│ Login Flow     myapp.com/login    Every 15m   ✅ Active │ [▶] [✏️] [🗑️]
│ Checkout Flow  myapp.com/cart     Every 30m   ❌ Error  │ [▶] [✏️] [🗑️]
│ Homepage       myapp.com          Every 1h    ⏸ Paused │ [▶] [✏️] [🗑️]
└──────────────────────────────────────────────────────┘
```

### Create Test Dialog

Clicking "+ New Test" opens a dialog with:

```
Create Test Suite
┌──────────────────────────────────────┐
│ Name:     [Login Flow              ] │
│ URL:      [https://myapp.com/login ] │
│ Goal:     [Verify the login form   ] │
│           [loads and accepts creds ] │
│ Schedule: [Every 15 minutes     ▾ ] │
│ Alert:    [https://hooks.slack...  ] │
│           (optional)                 │
│                                      │
│           [Cancel]  [Create Test]    │
└──────────────────────────────────────┘
```

### Schedule Dropdown Options

Use a select dropdown, not raw cron input. Map to cron expressions:

| Label | Cron |
|-------|------|
| Every 5 minutes | `*/5 * * * *` |
| Every 15 minutes | `*/15 * * * *` |
| Every 30 minutes | `*/30 * * * *` |
| Every hour | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Every 12 hours | `0 */12 * * *` |
| Daily | `0 9 * * *` |

### Action Buttons Per Row

- **▶ Run** — `POST /api/tests/{id}/run` (manual trigger, shows result inline or navigates to run page)
- **✏️ Edit** — opens edit dialog (same as create but pre-filled)
- **🗑️ Delete** — confirmation dialog, then `DELETE /api/tests/{id}`

### API Calls from Frontend

```typescript
// List tests
GET /api/tests → { tests: [...], total: number }

// Create test
POST /api/tests → { id, name, url, goal, schedule, ... }
Body: { name, url, goal, schedule, alert_webhook? }

// Update test
PUT /api/tests/{id} → { id, name, url, goal, schedule, ... }
Body: { name?, url?, goal?, schedule?, alert_webhook?, status? }

// Delete test
DELETE /api/tests/{id} → { status: "deleted", id }

// Run test manually
POST /api/tests/{id}/run → { plan, browser_result, result }
```

### TanStack Query Integration

```typescript
// Hook: useTests()
const { data, isLoading } = useQuery({
  queryKey: ["/api/tests"],
  refetchInterval: 30000,  // refresh every 30s
});

// Mutation: useCreateTest()
const createTest = useMutation({
  mutationFn: (data) => apiRequest("POST", "/api/tests", data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tests"] }),
});

// Mutation: useDeleteTest()
const deleteTest = useMutation({
  mutationFn: (id) => apiRequest("DELETE", `/api/tests/${id}`),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tests"] }),
});
```

---

## Step 6: Frontend — Dashboard Metrics (`dashboard.tsx`)

Wire the placeholder metrics to real data:

```typescript
// Fetch test list for metrics
const { data } = useQuery({ queryKey: ["/api/tests"] });
const tests = data?.tests || [];
const total = tests.length;
const passing = tests.filter(t => t.last_result === "passed").length;
const failing = tests.filter(t => t.last_result === "failed").length;
```

Replace the hardcoded `0` values with `total`, `passing`, `failing`.

Also update the "Recent Test Runs" section — for now, show the test list sorted by `last_run_at` (most will be empty until Phase 3 executes them, but the structure will be ready).

---

## Step 7: Frontend — Save from Run Test Page (Optional)

Add a "Save as Test Suite" button to the Run Test page that appears after a successful test run. Pre-fills the create dialog with the URL and goal that were just tested.

This is a nice-to-have — skip if time is tight.

---

## Implementation Order

| Order | Task | Where | Time |
|-------|------|-------|------|
| 1 | Add Pydantic models to `models.py` | Backend | 5 min |
| 2 | Create `services/test_suite.py` (Redis CRUD + QStash) | Backend | 15 min |
| 3 | Create `api/tests.py` (FastAPI router) | Backend | 10 min |
| 4 | Mount router in `main.py`, remove old endpoints | Backend | 5 min |
| 5 | Test CRUD via Swagger UI (`/docs`) | Backend | 10 min |
| 6 | Verify QStash schedules in Upstash console | Backend | 5 min |
| 7 | Update `tests.tsx` — test list table + create dialog | Frontend | 20 min |
| 8 | Update `dashboard.tsx` — wire metrics to real data | Frontend | 10 min |
| 9 | End-to-end test: create test from UI → see in list → delete | Full stack | 10 min |

**Total: ~90 minutes**

---

## QStash Free Tier Consideration

QStash free tier has limits on schedules (check current limits at console.upstash.com). For the hackathon:
- Don't create more than 3-5 test suites with schedules
- Use longer intervals (every 15-30 min) to stay under message limits
- The manual "Run Now" button bypasses QStash entirely

---

## Exit Criteria

- [ ] `POST /api/tests` creates a test in Redis and registers QStash cron schedule
- [ ] `GET /api/tests` returns all tests from Redis
- [ ] `GET /api/tests/{id}` returns a single test
- [ ] `PUT /api/tests/{id}` updates a test; schedule changes update QStash
- [ ] `DELETE /api/tests/{id}` removes test from Redis and deletes QStash schedule
- [ ] QStash schedules visible in Upstash console after creating a test
- [ ] Tests page shows test list table with name, URL, schedule, status
- [ ] "+ New Test" button opens create dialog and successfully creates a test
- [ ] Edit and delete work from the Tests page
- [ ] "Run Now" button triggers the pipeline for a saved test
- [ ] Dashboard metrics show real test counts
- [ ] No orphaned QStash schedules (Redis always written before QStash)

---

## What This Enables

After Phase 2:
- **Phase 3** wires the `POST /api/callback/{test_id}` endpoint to load the test from Redis and run the pipeline. Results get stored back in Redis.
- **Phase 4** adds result history, timing metrics, and uptime queries from Redis Sorted Sets.
- The test lifecycle is complete: create → schedule → execute (Phase 3) → view results (Phase 4).

---

## Next: Phase 3 — QStash Callback + Result Storage

Phase 3 connects the QStash cron trigger to the multi-agent pipeline and stores results in Redis for querying.
