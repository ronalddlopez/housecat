import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from services.config import get_redis
from services.test_suite import list_test_suites

router = APIRouter(prefix="/api", tags=["results"])


@router.get("/tests/{test_id}/results")
async def get_results(test_id: str, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    redis = get_redis()

    total = redis.zcard(f"results:{test_id}")

    raw_results = redis.zrevrange(f"results:{test_id}", offset, offset + limit - 1)

    results = []
    for raw in raw_results:
        try:
            results.append(json.loads(raw))
        except json.JSONDecodeError:
            continue

    return {
        "test_id": test_id,
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/tests/{test_id}/timing")
async def get_timing(test_id: str, limit: int = Query(50, ge=1, le=200)):
    redis = get_redis()

    total = redis.zcard(f"timing:{test_id}")

    raw_entries = redis.zrevrange(f"timing:{test_id}", 0, limit - 1, withscores=True)

    timing = []
    for member, score in raw_entries:
        parts = member.split(":", 1)
        if len(parts) == 2:
            duration_str, _run_id_part = parts
        else:
            duration_str = parts[0]

        try:
            duration_ms = int(float(duration_str))
        except (ValueError, TypeError):
            continue

        ts = datetime.fromtimestamp(score, tz=timezone.utc).isoformat()
        timing.append({"timestamp": ts, "duration_ms": duration_ms})

    return {
        "test_id": test_id,
        "timing": timing,
        "total": total,
    }


@router.get("/tests/{test_id}/uptime")
async def get_uptime(test_id: str, hours: int = Query(24, ge=1, le=720)):
    redis = get_redis()

    now = datetime.now(timezone.utc)
    min_timestamp = now.timestamp() - (hours * 3600)

    raw_results = redis.zrangebyscore(f"results:{test_id}", min_timestamp, "+inf")

    total_runs = 0
    passed_runs = 0
    for raw in raw_results:
        try:
            record = json.loads(raw)
            total_runs += 1
            if record.get("passed"):
                passed_runs += 1
        except json.JSONDecodeError:
            continue

    failed_runs = total_runs - passed_runs
    uptime_pct = round((passed_runs / total_runs) * 100, 1) if total_runs > 0 else 100.0

    return {
        "test_id": test_id,
        "uptime_pct": uptime_pct,
        "total_runs": total_runs,
        "passed_runs": passed_runs,
        "failed_runs": failed_runs,
        "window_hours": hours,
    }


@router.get("/tests/{test_id}/incidents")
async def get_incidents(test_id: str, limit: int = Query(10, ge=1, le=50)):
    redis = get_redis()

    total = redis.llen(f"incidents:{test_id}")

    raw_incidents = redis.lrange(f"incidents:{test_id}", 0, limit - 1)

    incidents = []
    for raw in raw_incidents:
        try:
            incidents.append(json.loads(raw))
        except json.JSONDecodeError:
            continue

    return {
        "test_id": test_id,
        "incidents": incidents,
        "total": total,
    }


@router.get("/dashboard")
async def get_dashboard():
    tests = list_test_suites()

    total_tests = len(tests)
    active_tests = sum(1 for t in tests if t.get("status") == "active")
    paused_tests = sum(1 for t in tests if t.get("status") == "paused")
    passing = sum(1 for t in tests if t.get("last_result") == "passed")
    failing = sum(1 for t in tests if t.get("last_result") == "failed")
    pending = sum(1 for t in tests if t.get("last_result") in ("pending", "", None))

    sorted_tests = sorted(
        [t for t in tests if t.get("last_run_at")],
        key=lambda t: t["last_run_at"],
        reverse=True,
    )

    recent_runs = [
        {
            "test_id": t.get("id"),
            "test_name": t.get("name"),
            "test_url": t.get("url"),
            "last_result": t.get("last_result"),
            "last_run_at": t.get("last_run_at"),
        }
        for t in sorted_tests[:5]
    ]

    return {
        "total_tests": total_tests,
        "active_tests": active_tests,
        "paused_tests": paused_tests,
        "passing": passing,
        "failing": failing,
        "pending": pending,
        "recent_runs": recent_runs,
    }


@router.get("/tests/{test_id}/live")
async def get_live_events(test_id: str, request: Request):
    async def event_stream():
        redis = get_redis()

        resume_id = request.headers.get("last-event-id", "")
        last_id = resume_id if resume_id else "0-0"

        if resume_id:
            existing = redis.xrange(f"events:{test_id}", min=f"({resume_id}", max="+", count=50)
        else:
            existing = redis.xrange(f"events:{test_id}", min="-", max="+", count=50)

        for entry_id, fields in existing:
            data = json.dumps(fields)
            yield f"id: {entry_id}\ndata: {data}\n\n"
            last_id = entry_id

        idle_seconds = 0
        max_idle = 300
        keepalive_interval = 15

        while idle_seconds < max_idle:
            if await request.is_disconnected():
                break

            new_entries = redis.xrange(f"events:{test_id}", min=f"({last_id}", max="+", count=20)

            if new_entries:
                idle_seconds = 0
                for entry_id, fields in new_entries:
                    data = json.dumps(fields)
                    yield f"id: {entry_id}\ndata: {data}\n\n"
                    last_id = entry_id
            else:
                idle_seconds += 1
                if idle_seconds % keepalive_interval == 0:
                    yield ":\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
