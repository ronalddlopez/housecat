import os
import json
import httpx
from typing import Callable, Awaitable

TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"


async def call_tinyfish(
    url: str,
    goal: str,
    timeout: float = 120.0,
    on_streaming_url: Callable[[str], Awaitable[None]] | None = None,
) -> dict:
    tinyfish_key = os.environ.get("TINYFISH_API_KEY", "")
    steps_observed = []

    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
        async with client.stream(
            "POST",
            TINYFISH_URL,
            headers={
                "X-API-Key": tinyfish_key,
                "Content-Type": "application/json",
            },
            json={"url": url, "goal": goal},
        ) as response:
            if response.status_code != 200:
                error_body = ""
                async for chunk in response.aiter_bytes():
                    error_body += chunk.decode("utf-8", errors="replace")
                return {
                    "success": False,
                    "data": None,
                    "raw": None,
                    "streaming_url": None,
                    "error": f"TinyFish HTTP {response.status_code}: {error_body[:200]}",
                    "steps": [],
                }

            result_json = None
            raw_result = None
            streaming_url = None

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    data = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue

                event_type = data.get("type")

                if event_type == "STREAMING_URL":
                    streaming_url = data.get("streamingUrl")
                    if streaming_url and on_streaming_url:
                        try:
                            await on_streaming_url(streaming_url)
                        except Exception as e:
                            print(f"[TinyFish] on_streaming_url callback error: {e}")
                elif event_type == "STEP":
                    steps_observed.append({
                        "message": data.get("message", ""),
                        "purpose": data.get("purpose", ""),
                        "action": data.get("action", ""),
                    })
                elif event_type == "COMPLETE":
                    raw_result = data.get("resultJson")
                    if isinstance(raw_result, str):
                        try:
                            result_json = json.loads(raw_result)
                        except json.JSONDecodeError:
                            result_json = {"raw_text": raw_result}
                    elif isinstance(raw_result, dict):
                        result_json = raw_result
                        raw_result = json.dumps(raw_result)
                elif event_type == "ERROR":
                    return {
                        "success": False,
                        "data": None,
                        "raw": None,
                        "streaming_url": streaming_url,
                        "error": data.get("message", "Unknown TinyFish error"),
                        "steps": steps_observed,
                    }

            if result_json is None and raw_result is None:
                return {
                    "success": False,
                    "data": None,
                    "raw": None,
                    "streaming_url": streaming_url,
                    "error": "TinyFish stream ended without a COMPLETE event",
                    "steps": steps_observed,
                }

            return {
                "success": True,
                "data": result_json,
                "raw": raw_result,
                "streaming_url": streaming_url,
                "error": None,
                "steps": steps_observed,
            }
