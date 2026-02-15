# Phase 3: QStash Callback + Result Storage — Implementation Plan

**Goal:** QStash cron triggers test execution. Results persisted in Redis for querying. Alert webhooks fire on failure.

**Time estimate:** ~45 minutes for Replit agent

---

## What Exists Today

| Component | Current State |
|-----------|--------------|
| `POST /api/callback/{test_id}` | Placeholder — logs and returns `{"status": "received"}` |
| `POST /api/tests/{test_id}/run` | Runs pipeline, returns result to HTTP response, **nothing saved** |
| `POST /api/run-test` | Same — runs pipeline, returns result, nothing saved |
| `run_test()` pipeline | Returns `(plan, browser_result, final_result)` — works correctly |
| Redis keys `results:{id}`, `timing:{id}`, `events:{id}`, `incidents:{id}` | Referenced in `delete_test_suite()` cleanup but never written to |
| `last_result` / `last_run_at` on test hash | Fields exist but never updated after a run |
| `alert_webhook` on test hash | Stored but never called |

---

## What Phase 3 Delivers

1. **QStash callback handler** — receives cron trigger, loads test, runs pipeline
2. **Result persistence** — every run saved to Redis (Sorted Set + test hash update)
3. **Execution logging** — step-by-step events logged to Redis Stream
4. **Incident tracking** — failures pushed to Redis List
5. **Alert webhooks** — HTTP POST to alert URL on test failure
6. **Manual run persistence** — `/api/tests/{id}/run` also saves results (same logic)

---

## Redis Key Schema (Phase 3 additions)

```
results:{test_id}    Sorted Set   score=unix_timestamp, member=JSON(RunRecord)
timing:{test_id}     Sorted Set   score=unix_timestamp, member=duration_ms
events:{test_id}     Stream       fields: {type, message, timestamp, [step_number]}
incidents:{test_id}  List         JSON(IncidentRecord) — LPUSH (newest first)
test:{test_id}       Hash         UPDATE last_result, last_run_at after each run
```

### Data Structures

**RunRecord** (stored as JSON string in `results:{test_id}` Sorted Set):
```json
{
  "run_id": "a1b2c3d4",
  "test_id": "abc12345",
  "passed": true,
  "duration_ms": 12340,
  "steps_passed": 3,
  "steps_total": 3,
  "details": "All steps passed successfully.",
  "step_results": [
    {"step_number": 1, "passed": true, "details": "...", "retry_count": 0}
  ],
  "error": null,
  "triggered_by": "qstash",
  "started_at": "2026-02-14T10:00:00Z",
  "completed_at": "2026-02-14T10:00:12Z"
}
```

**IncidentRecord** (stored as JSON string in `incidents:{test_id}` List):
```json
{
  "run_id": "a1b2c3d4",
  "test_id": "abc12345",
  "error": "Step 2 failed: button not found",
  "details": "2 of 3 steps passed. Step 2 could not locate the submit button.",
  "started_at": "2026-02-14T10:00:00Z",
  "alert_sent": true
}
```

**Event Stream entries** (`events:{test_id}`):
```
type=plan_start     message="Planning test for https://example.com"
type=plan_complete  message="Plan created: 3 steps"
type=step_start     message="Executing step 1: Navigate to homepage"  step_number=1
type=step_complete  message="Step 1 passed"  step_number=1  passed=true
type=step_complete  message="Step 2 failed: element not found"  step_number=2  passed=false
type=eval_start     message="Evaluating results"
type=eval_complete  message="Test PASSED — 3/3 steps"  passed=true
type=error          message="Pipeline error: TinyFish timeout"
```

---

## Implementation Plan

### File 1: `backend/services/result_store.py` (NEW)

Service module for persisting run results. Keeps all Redis write logic in one place.

```python
import json
import uuid
from datetime import datetime, timezone
from services.config import get_redis

def store_run_result(test_id: str, final_result, plan, browser_result, triggered_by: str = "manual") -> dict:
    """Store a complete run result in Redis. Returns the RunRecord."""
    redis = get_redis()
    now = datetime.now(timezone.utc)
    run_id = str(uuid.uuid4())[:8]

    run_record = {
        "run_id": run_id,
        "test_id": test_id,
        "passed": final_result.passed,
        "duration_ms": final_result.duration_ms,
        "steps_passed": final_result.steps_passed,
        "steps_total": final_result.steps_total,
        "details": final_result.details,
        "step_results": [sr.model_dump() for sr in final_result.step_results],
        "error": final_result.error,
        "triggered_by": triggered_by,
        "started_at": now.isoformat(),
        "completed_at": now.isoformat(),
    }

    timestamp = now.timestamp()

    # 1. Store run record in Sorted Set (score = timestamp)
    redis.zadd(f"results:{test_id}", {json.dumps(run_record): timestamp})

    # 2. Store timing in Sorted Set
    redis.zadd(f"timing:{test_id}", {str(final_result.duration_ms): timestamp})

    # 3. Update test hash with latest result
    redis.hset(f"test:{test_id}", values={
        "last_result": "passed" if final_result.passed else "failed",
        "last_run_at": now.isoformat(),
    })

    # 4. If failed, track incident
    if not final_result.passed:
        incident = {
            "run_id": run_id,
            "test_id": test_id,
            "error": final_result.error or final_result.details,
            "details": final_result.details,
            "started_at": now.isoformat(),
            "alert_sent": False,
        }
        redis.lpush(f"incidents:{test_id}", json.dumps(incident))

    return run_record


def log_event(test_id: str, event_type: str, message: str, **extra_fields):
    """Log an event to the Redis Stream for live view."""
    redis = get_redis()
    fields = {
        "type": event_type,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    fields.update({k: str(v) for k, v in extra_fields.items()})
    redis.xadd(f"events:{test_id}", fields)
```

---

### File 2: `backend/services/alert.py` (NEW)

Simple HTTP POST alert sender. Called when a test fails and has an `alert_webhook` configured.

```python
import httpx
import json
from datetime import datetime, timezone

async def send_alert_webhook(webhook_url: str, test_data: dict, run_record: dict):
    """Send failure alert to the configured webhook URL."""
    if not webhook_url:
        return False

    payload = {
        "event": "test_failed",
        "test": {
            "id": test_data.get("id"),
            "name": test_data.get("name"),
            "url": test_data.get("url"),
        },
        "result": {
            "run_id": run_record.get("run_id"),
            "passed": run_record.get("passed"),
            "steps_passed": run_record.get("steps_passed"),
            "steps_total": run_record.get("steps_total"),
            "details": run_record.get("details"),
            "error": run_record.get("error"),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            return response.status_code < 400
    except Exception as e:
        print(f"Alert webhook failed for {webhook_url}: {e}")
        return False
```

---

### File 3: Update `backend/agents/pipeline.py`

Add event logging throughout the pipeline so the Redis Stream captures each phase.

**Current signature:**
```python
async def run_test(url: str, goal: str) -> tuple[TestPlan, BrowserResult, TestResult]:
```

**Updated — add optional `test_id` parameter for event logging:**
```python
async def run_test(url: str, goal: str, test_id: str | None = None) -> tuple[TestPlan, BrowserResult, TestResult]:
```

**Changes:**
- Import `log_event` from `services.result_store`
- Before Planner: `log_event(test_id, "plan_start", f"Planning test for {url}")` (only if test_id provided)
- After Planner: `log_event(test_id, "plan_complete", f"Plan created: {plan.total_steps} steps")`
- The Browser agent currently runs as a single TinyFish call — log start/complete for it
- After each step result extracted: `log_event(test_id, "step_complete", ..., step_number=N, passed=True/False)`
- Before Evaluator: `log_event(test_id, "eval_start", "Evaluating results")`
- After Evaluator: `log_event(test_id, "eval_complete", f"Test {'PASSED' if result.passed else 'FAILED'}", passed=result.passed)`
- On any exception: `log_event(test_id, "error", str(e))`
- Keep `test_id` optional so `POST /api/run-test` (ad-hoc) still works without logging

---

### File 4: Update `backend/main.py` — Callback Endpoint

Replace the placeholder callback with real execution logic.

**Current (lines 82-85):**
```python
@app.post("/api/callback/{test_id}")
async def qstash_callback(test_id: str):
    print(f"QStash callback received for test: {test_id}")
    return {"status": "received", "test_id": test_id}
```

**Updated:**
```python
@app.post("/api/callback/{test_id}")
async def qstash_callback(test_id: str):
    """QStash cron trigger — load test, run pipeline, store result."""
    from services.test_suite import get_test_suite
    from services.result_store import store_run_result, log_event
    from services.alert import send_alert_webhook
    from agents.pipeline import run_test

    # 1. Load test definition
    test = get_test_suite(test_id)
    if not test:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)

    # 2. Skip if paused
    if test.get("status") == "paused":
        return {"status": "skipped", "reason": "test is paused"}

    try:
        # 3. Run the pipeline with event logging
        plan, browser_result, final_result = await run_test(
            url=test["url"],
            goal=test["goal"],
            test_id=test_id,
        )

        # 4. Store result
        run_record = store_run_result(
            test_id=test_id,
            final_result=final_result,
            plan=plan,
            browser_result=browser_result,
            triggered_by="qstash",
        )

        # 5. Send alert on failure
        if not final_result.passed and test.get("alert_webhook"):
            alert_sent = await send_alert_webhook(test["alert_webhook"], test, run_record)
            if alert_sent:
                # Update incident record
                redis = get_redis()
                # The most recent incident is at index 0 (LPUSH)
                import json
                incidents = redis.lrange(f"incidents:{test_id}", 0, 0)
                if incidents:
                    incident = json.loads(incidents[0])
                    incident["alert_sent"] = True
                    redis.lset(f"incidents:{test_id}", 0, json.dumps(incident))

        return {
            "status": "completed",
            "test_id": test_id,
            "passed": final_result.passed,
            "run_id": run_record["run_id"],
        }

    except Exception as e:
        log_event(test_id, "error", f"Pipeline error: {str(e)}")
        # Still update the test hash so dashboard shows failure
        redis = get_redis()
        from datetime import datetime, timezone
        redis.hset(f"test:{test_id}", values={
            "last_result": "error",
            "last_run_at": datetime.now(timezone.utc).isoformat(),
        })
        return JSONResponse(
            content={"error": str(e), "test_id": test_id},
            status_code=500,
        )
```

**Important:** Add QStash signature verification later (stretch — not required for hackathon). For now, trust that only QStash calls this endpoint.

---

### File 5: Update `backend/api/tests.py` — Manual Run Persistence

The `POST /api/tests/{test_id}/run` endpoint currently runs the pipeline but doesn't save results. Add persistence.

**Current (lines 55-78):**
```python
@router.post("/tests/{test_id}/run")
async def run_test_now(test_id: str):
    test = get_test_suite(test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    try:
        plan, browser_result, final_result = await run_test(test["url"], test["goal"])
        return { ... }  # Returns result but doesn't save
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Updated:**
```python
@router.post("/tests/{test_id}/run")
async def run_test_now(test_id: str):
    test = get_test_suite(test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    try:
        plan, browser_result, final_result = await run_test(
            url=test["url"],
            goal=test["goal"],
            test_id=test_id,  # Enable event logging
        )

        # Store result (same as callback)
        from services.result_store import store_run_result
        from services.alert import send_alert_webhook
        run_record = store_run_result(
            test_id=test_id,
            final_result=final_result,
            plan=plan,
            browser_result=browser_result,
            triggered_by="manual",
        )

        # Alert on failure
        if not final_result.passed and test.get("alert_webhook"):
            await send_alert_webhook(test["alert_webhook"], test, run_record)

        return {
            "run_id": run_record["run_id"],
            "plan": plan.model_dump(),
            "browser_result": browser_result.model_dump(),
            "result": final_result.model_dump(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

### File 6: Update `backend/main.py` — Ad-hoc Run (Optional Persistence)

The `POST /api/run-test` endpoint is for quick ad-hoc tests from the "Run Test" page. These don't have a `test_id` so they **don't persist** — this is intentional. No changes needed here unless we want to add optional persistence later.

**No changes required.**

---

## Dependency: `httpx`

The alert webhook uses `httpx` for async HTTP calls. Add to `requirements.txt` if not already present:
```
httpx
```

(Check if it's already installed — Pydantic AI or TinyFish client may already pull it in.)

---

## Implementation Order

| Step | Task | Time |
|------|------|------|
| 1 | Create `services/config.py` (extract shared helpers) | 3 min |
| 2 | Create `services/result_store.py` | 8 min |
| 3 | Create `services/alert.py` | 5 min |
| 4 | Update `agents/pipeline.py` with event logging | 8 min |
| 5 | Update `main.py` callback endpoint | 10 min |
| 6 | Update `api/tests.py` manual run endpoint | 5 min |
| 7 | Add `httpx` to requirements if needed | 1 min |
| 8 | Test: manual run → verify Redis keys populated | 5 min |
| | **Total** | **~45 min** |

---

## Testing Plan

### Test 1: Manual Run Persistence
1. Create a test suite via UI (Tests page → + New Test)
2. Click the run button (or `POST /api/tests/{test_id}/run`)
3. Verify in Redis (via Upstash console or health endpoint):
   - `results:{test_id}` Sorted Set has 1 entry
   - `timing:{test_id}` Sorted Set has 1 entry
   - `events:{test_id}` Stream has plan_start → plan_complete → step events → eval events
   - `test:{test_id}` Hash has updated `last_result` and `last_run_at`
   - If test failed: `incidents:{test_id}` List has 1 entry

### Test 2: QStash Callback
1. Create a test suite with a fast schedule (e.g., every 5 minutes: `*/5 * * * *`)
2. Wait for QStash to fire the callback
3. Verify same Redis keys are populated with `triggered_by: "qstash"`
4. Check Upstash QStash console for delivery logs

### Test 3: Alert Webhook
1. Use a webhook testing service (e.g., webhook.site) as the `alert_webhook`
2. Create a test that will fail (e.g., goal: "Find a button labeled 'XYZNONEXISTENT'")
3. Run manually → verify webhook receives the failure payload
4. Check `incidents:{test_id}` has `alert_sent: true`

### Test 4: Dashboard Updates
1. Run a few tests (mix of pass/fail)
2. Check Dashboard page — metrics should update (passing/failing counts)
3. Recent test runs should show with correct status icons and timestamps

---

## Exit Criteria

- [ ] QStash cron fires → callback loads test → pipeline runs → result saved in Redis
- [ ] Manual run (`POST /api/tests/{id}/run`) also saves results to Redis
- [ ] `last_result` and `last_run_at` updated on test hash after every run
- [ ] Failed runs create incident records in `incidents:{test_id}`
- [ ] Alert webhook fires on failure (when configured)
- [ ] Event stream captures step-by-step execution log
- [ ] Dashboard metrics reflect stored results (passing/failing counts)
- [ ] Multiple runs accumulate in `results:{test_id}` (not overwritten)

---

## What This Unlocks

Phase 3 is the **write side**. Once results are persisting, Phase 4 adds the **read side**:
- `GET /api/tests/{id}/results` — paginated history from Sorted Set
- `GET /api/tests/{id}/timing` — response time chart data
- `GET /api/tests/{id}/uptime` — uptime percentage calculation
- `GET /api/tests/{id}/live` — SSE stream from Redis Stream (for Phase 6 live view)

---

## Notes

- **No QStash signature verification** for hackathon. The callback URL is obscure enough (UUID test IDs). Add `Upstash-Signature` verification post-hackathon.
- **Redis Stream trimming**: Not needed for hackathon. For production, add `MAXLEN ~1000` to `XADD` calls to prevent unbounded growth.
- **Result set trimming**: Similarly, limit `results:{test_id}` to last 100 entries in production. Not needed for demo.
- **httpx vs requests**: Using `httpx` for async compatibility with FastAPI. If already in deps, no new install needed.
