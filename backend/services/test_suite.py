import os
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
    redis = get_redis()
    qstash = get_qstash()
    public_url = get_public_url()

    test_id = str(uuid.uuid4())[:8]
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
        "schedule_id": "",
    }

    redis.hset(f"test:{test_id}", values=test)
    redis.sadd("tests:all", test_id)

    try:
        schedule_result = qstash.schedule.create(
            destination=f"{public_url}/api/callback/{test_id}",
            cron=test["schedule"],
        )
        if hasattr(schedule_result, "schedule_id"):
            schedule_id = schedule_result.schedule_id
        else:
            schedule_id = str(schedule_result)
        test["schedule_id"] = schedule_id
        redis.hset(f"test:{test_id}", values={"schedule_id": test["schedule_id"]})
    except Exception as e:
        test["status"] = "error"
        redis.hset(f"test:{test_id}", values={"status": "error"})
        print(f"QStash schedule creation failed for {test_id}: {e}")

    return test


def list_test_suites() -> list[dict]:
    redis = get_redis()
    test_ids = redis.smembers("tests:all")

    if not test_ids:
        return []

    tests = []
    for test_id in test_ids:
        data = redis.hgetall(f"test:{test_id}")
        if data:
            tests.append(data)

    tests.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return tests


def get_test_suite(test_id: str) -> dict | None:
    redis = get_redis()
    data = redis.hgetall(f"test:{test_id}")
    return data if data else None


def update_test_suite(test_id: str, updates: dict) -> dict | None:
    redis = get_redis()
    qstash = get_qstash()
    public_url = get_public_url()

    existing = redis.hgetall(f"test:{test_id}")
    if not existing:
        return None

    changes = {k: v for k, v in updates.items() if v is not None}
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "schedule" in changes and changes["schedule"] != existing.get("schedule"):
        old_schedule_id = existing.get("schedule_id")

        if old_schedule_id:
            try:
                qstash.schedule.delete(old_schedule_id)
            except Exception as e:
                print(f"Failed to delete old QStash schedule {old_schedule_id}: {e}")

        try:
            new_result = qstash.schedule.create(
                destination=f"{public_url}/api/callback/{test_id}",
                cron=changes["schedule"],
            )
            if hasattr(new_result, "schedule_id"):
                new_schedule_id = new_result.schedule_id
            else:
                new_schedule_id = str(new_result)
            changes["schedule_id"] = new_schedule_id
        except Exception as e:
            changes["status"] = "error"
            print(f"QStash schedule update failed for {test_id}: {e}")

    if changes.get("status") == "paused":
        schedule_id = existing.get("schedule_id")
        if schedule_id:
            try:
                qstash.schedule.delete(schedule_id)
                changes["schedule_id"] = ""
            except Exception as e:
                print(f"Failed to pause QStash schedule {schedule_id}: {e}")

    if changes.get("status") == "active" and existing.get("status") == "paused":
        schedule = changes.get("schedule") or existing.get("schedule", "*/15 * * * *")
        try:
            new_result = qstash.schedule.create(
                destination=f"{public_url}/api/callback/{test_id}",
                cron=schedule,
            )
            if hasattr(new_result, "schedule_id"):
                new_schedule_id = new_result.schedule_id
            else:
                new_schedule_id = str(new_result)
            changes["schedule_id"] = new_schedule_id
        except Exception as e:
            changes["status"] = "error"
            print(f"QStash schedule resume failed for {test_id}: {e}")

    redis.hset(f"test:{test_id}", values=changes)

    return redis.hgetall(f"test:{test_id}")


def delete_test_suite(test_id: str) -> bool:
    redis = get_redis()
    qstash = get_qstash()

    existing = redis.hgetall(f"test:{test_id}")
    if not existing:
        return False

    schedule_id = existing.get("schedule_id")
    if schedule_id:
        try:
            qstash.schedule.delete(schedule_id)
        except Exception as e:
            print(f"Failed to delete QStash schedule {schedule_id}: {e}")

    redis.delete(f"test:{test_id}")
    redis.srem("tests:all", test_id)

    redis.delete(f"results:{test_id}")
    redis.delete(f"timing:{test_id}")
    redis.delete(f"events:{test_id}")
    redis.delete(f"incidents:{test_id}")

    return True
