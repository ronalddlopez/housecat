import httpx
from datetime import datetime, timezone


async def send_alert_webhook(webhook_url: str, test_data: dict, run_record: dict) -> bool:
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
