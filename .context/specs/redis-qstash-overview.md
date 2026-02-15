# Redis & QStash — How They Work in HouseCat

## Upstash Redis — Your Entire Database

Think of Redis as a **fast, in-memory key-value store** — but with powerful data structures beyond just key=value. Upstash is Redis hosted as a service with a REST API, so you don't run a server.

### Why Redis instead of Postgres?

For a hackathon: **zero setup**. No migrations, no schemas, no ORM. You just start writing data. Upstash gives you a REST endpoint + token and you're live in 30 seconds.

### What Redis Handles in HouseCat

| What | Redis Data Structure | How It Works |
|------|---------------------|-------------|
| **Test suite definitions** | Hash | Like a dictionary. `test:abc123` stores `{name, url, goal, schedule, ...}` as fields |
| **List of all tests** | Set | `tests:all` is a bag of test IDs. Add/remove as tests are created/deleted |
| **Test result history** | Sorted Set | Each result has a score (timestamp). Query "give me all results between 2pm and 6pm" is built-in |
| **Response time tracking** | Sorted Set | Same idea — score=timestamp, value=duration_ms. Instant time-series charts |
| **Live execution events** | Stream | Append-only log. Agent writes "step 1: navigating...", "step 2: clicking...", frontend reads in real-time |
| **Active incidents** | List | Simple list of failure events, push/pop |

### Practical Example — What the Code Looks Like

> **Important:** Requires `upstash-redis>=1.6.0` for Stream support (`xadd`, `xrange`, `xread`). Earlier versions don't have stream commands.

```python
from upstash_redis import Redis

redis = Redis(url="https://xxx.upstash.io", token="AXxx...")

# Store a test suite (Hash — like a dictionary with fields)
redis.hset("test:abc123", values={
    "name": "Login Flow",
    "url": "https://myapp.com/login",
    "goal": "Enter credentials, click login, verify dashboard",
    "schedule": "*/15 * * * *"
})

# Get it back
test = redis.hgetall("test:abc123")
# → {"name": "Login Flow", "url": "https://myapp.com/login", ...}

# Track that this test exists
redis.sadd("tests:all", "abc123")

# Store a test result (Sorted Set — score is timestamp)
import time, json
redis.zadd("results:abc123", {
    json.dumps({"passed": True, "duration_ms": 3200, "details": "Dashboard loaded"}): time.time()
})

# Query: "last 10 results" (sorted by timestamp, newest first)
results = redis.zrange("results:abc123", 0, 9, rev=True)

# Query: "all results in the last 24 hours"
now = time.time()
day_ago = now - 86400
results = redis.zrangebyscore("results:abc123", day_ago, now)

# Live events (Stream — append-only log)
# NOTE: xadd requires an explicit id parameter ("*" for auto-generated)
redis.xadd("events:abc123", "*", {"type": "step", "message": "Navigating to login page..."})
redis.xadd("events:abc123", "*", {"type": "step", "message": "Entering credentials..."})
redis.xadd("events:abc123", "*", {"type": "pass", "message": "Dashboard loaded successfully"})

# Frontend reads the stream (gets new events since last read)
# NOTE: xrange uses positional args, not keyword args
events = redis.xrange("events:abc123", "-", "+")
# Returns: [[id, [k1, v1, k2, v2, ...]], ...]
# Convert flat fields to dict:
def parse_stream_fields(flat_list):
    return dict(zip(flat_list[::2], flat_list[1::2]))

# Polling for new events (xread has no blocking in Upstash REST API)
results = redis.xread({"events:abc123": "0-0"}, count=10)
# Returns: [[stream_name, [[id, [k1,v1,...]], ...]], ...]  (nested list, NOT a dict)
```

### Key Insight

Each Redis data structure solves a specific problem:
- **Hash** = structured object (like a DB row, but no schema needed)
- **Set** = bag of unique items (like an index)
- **Sorted Set** = items ordered by score (perfect for time-series — score=timestamp)
- **Stream** = append-only event log (perfect for real-time feeds)
- **String** = simple key=value (for quick flags, counters)

You never define a schema. You just write to keys. If the key doesn't exist, Redis creates it.

---

## QStash — Your Cron Scheduler + Job Queue

QStash is Upstash's **HTTP-based message queue**. The core idea:

> "Call this URL on this schedule (or after a delay), and retry if it fails."

### Why QStash instead of a background worker?

In Turbinez, you have a `run_worker.py` that polls the database for QUEUED jobs. That requires a **separate long-running process**. QStash replaces that:

- No worker process to keep alive
- No polling loop
- QStash sends an HTTP POST to your server when it's time to run
- If your server is down or returns an error, QStash retries automatically

### What QStash Handles in HouseCat

| What | QStash Feature | How |
|------|---------------|-----|
| **"Run this test every 15 min"** | Cron schedule | You register a schedule, QStash calls your URL on the cron |
| **"Run this test once, now"** | Publish (one-shot) | Single HTTP callback, immediate |
| **Retry on failure** | Built-in retries | If your callback returns 500, QStash retries 3x with backoff |
| **Verify it's really QStash** | Signature verification | QStash signs requests so you can reject spoofed callbacks |

### Practical Example — The Full Flow

**Step 1: User creates a test with a 15-minute schedule**

```python
from qstash import QStash

client = QStash(token="QSxx...")

# Register a cron schedule — QStash will POST to your URL every 15 min
# NOTE: schedule.create() returns a schedule ID string directly, NOT an object
schedule_id = client.schedule.create(
    destination="https://your-app.replit.app/api/callback/abc123",
    cron="*/15 * * * *",
)
# Save the schedule_id so you can delete it later
redis.hset("test:abc123", "qstash_schedule_id", schedule_id)
```

**Step 2: Every 15 minutes, QStash POSTs to your server**

```python
# This endpoint receives the callback from QStash
@app.post("/api/callback/{test_id}")
async def qstash_callback(test_id: str, request: Request):
    # Optional: verify the request is really from QStash
    # (QStash signs requests with your signing keys)

    # Load the test definition from Redis
    test = redis.hgetall(f"test:{test_id}")

    # Run the AI agent (Claude + TinyFish)
    result = await run_agent(test["url"], test["goal"])

    # Store result in Redis
    redis.zadd(f"results:{test_id}", {json.dumps(result): time.time()})

    # Return 200 so QStash knows it succeeded
    # (if you return 500, QStash will retry)
    return {"status": "ok"}
```

**Step 3: User deletes a test — remove the schedule**

```python
schedule_id = redis.hget("test:abc123", "qstash_schedule_id")
client.schedule.delete(schedule_id)
```

### Key Insight

QStash is essentially **cron-as-a-service over HTTP**:

```
Without QStash:
  You run a worker process 24/7 that polls for jobs → complex, needs always-on process

With QStash:
  QStash calls YOUR server on a schedule → your server just handles HTTP requests
  If your server is down, QStash retries later → built-in reliability
```

Your FastAPI server doesn't need to know about scheduling at all. It just exposes a `/api/callback/{test_id}` endpoint and handles the request when it arrives.

---

## How They Work Together

```
User creates test "Login Flow, every 15 min"
        │
        ▼
FastAPI stores test definition ──→ Redis Hash (test:abc123)
FastAPI registers schedule ──────→ QStash Cron (*/15 * * * *)
        │
    (15 min later)
        │
QStash POSTs to /api/callback/abc123
        │
        ▼
FastAPI reads test from ──────────→ Redis Hash (test:abc123)
FastAPI runs AI agent ────────────→ Claude + TinyFish
FastAPI stores result ────────────→ Redis Sorted Set (results:abc123)
FastAPI stores timing ────────────→ Redis Sorted Set (timing:abc123)
FastAPI logs events ──────────────→ Redis Stream (events:abc123)
        │
        ▼
Dashboard queries Redis for charts, uptime %, history
```

Redis is the **state** (everything stored), QStash is the **trigger** (when things run). Your FastAPI server is just the **glue** that handles HTTP requests and orchestrates the agent.
