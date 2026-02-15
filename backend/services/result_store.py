import json
import uuid
from datetime import datetime, timezone
from backend.services.config import get_redis


def store_run_result(test_id: str, final_result, plan, browser_result, triggered_by: str = "manual") -> dict:
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

    redis.zadd(f"results:{test_id}", {json.dumps(run_record): timestamp})

    redis.zadd(f"timing:{test_id}", {str(final_result.duration_ms): timestamp})

    redis.hset(f"test:{test_id}", values={
        "last_result": "passed" if final_result.passed else "failed",
        "last_run_at": now.isoformat(),
    })

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
    redis = get_redis()
    fields = {
        "type": event_type,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    fields.update({k: str(v) for k, v in extra_fields.items()})
    redis.xadd(f"events:{test_id}", "*", data=fields)
