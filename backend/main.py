import os
import json
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from upstash_redis import Redis
from qstash import QStash

app = FastAPI(title="HouseCat", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_redis():
    return Redis(
        url=os.environ.get("UPSTASH_REDIS_REST_URL", ""),
        token=os.environ.get("UPSTASH_REDIS_REST_TOKEN", ""),
    )


def get_qstash():
    qstash_token = os.environ.get("QSTASH_TOKEN", "")
    qstash_url = os.environ.get("QSTASH_URL")
    if qstash_url:
        return QStash(qstash_token, base_url=qstash_url)
    return QStash(qstash_token)


def get_public_url():
    domain = os.environ.get("REPLIT_DEV_DOMAIN", "")
    if domain:
        return f"https://{domain}"
    return os.environ.get("PUBLIC_URL", "http://localhost:5000")


@app.get("/api/health")
async def health():
    status = {}

    try:
        redis = get_redis()
        redis.set("health:ping", "pong")
        val = redis.get("health:ping")
        status["redis"] = "connected" if val == "pong" else "error"
    except Exception as e:
        status["redis"] = f"error: {str(e)[:100]}"

    try:
        qstash = get_qstash()
        qstash.schedule.list()
        status["qstash"] = "connected"
    except Exception as e:
        status["qstash"] = f"error: {str(e)[:100]}"

    tinyfish_key = os.environ.get("TINYFISH_API_KEY", "")
    status["tinyfish"] = "key_set" if len(tinyfish_key) > 0 else "missing"

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    status["anthropic"] = "key_set" if len(anthropic_key) > 0 else "missing"

    status["publicUrl"] = get_public_url()

    all_ok = all(
        status[k] in ("connected", "key_set")
        for k in ["redis", "qstash", "tinyfish", "anthropic"]
    )
    status["overallStatus"] = "all_green" if all_ok else "issues_detected"

    return status


@app.post("/api/callback/{test_id}")
async def qstash_callback(test_id: str):
    print(f"QStash callback received for test: {test_id}")
    return {"status": "received", "testId": test_id}


@app.post("/api/tests/{test_id}/run")
async def run_test_manual(test_id: str, request: Request):
    from backend.agents.pipeline import run_test

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(content={"error": "Invalid JSON body"}, status_code=400)

    url = body.get("url")
    goal = body.get("goal")

    if not url or not goal:
        return JSONResponse(content={"error": "Both 'url' and 'goal' are required"}, status_code=400)

    try:
        plan, browser_result, final_result = await run_test(url, goal)

        return {
            "plan": plan.model_dump(),
            "browser_result": browser_result.model_dump(),
            "result": final_result.model_dump(),
        }
    except Exception as e:
        return JSONResponse(content={"error": f"Pipeline failed: {str(e)[:300]}"}, status_code=500)


@app.post("/api/test/tinyfish")
async def test_tinyfish():
    tinyfish_key = os.environ.get("TINYFISH_API_KEY")
    if not tinyfish_key:
        return {"success": False, "error": "TINYFISH_API_KEY not set"}

    try:
        from backend.services.tinyfish import call_tinyfish
        result = await call_tinyfish(
            "https://example.com",
            'What is the main heading on this page? Return JSON: {"heading": "..."}. Return valid JSON only.',
        )
        return {
            "success": result["success"],
            "result": result["raw"],
            "streamingUrl": result["streaming_url"],
            "error": result.get("error"),
        }
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


@app.post("/api/test/agent")
async def test_agent():
    import httpx

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        return {"success": False, "error": "ANTHROPIC_API_KEY not set"}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": anthropic_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 100,
                    "messages": [
                        {
                            "role": "user",
                            "content": "What is 2 + 2? Answer with just the number.",
                        }
                    ],
                },
            )

            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}",
                }

            data = response.json()
            answer = data.get("content", [{}])[0].get("text", str(data.get("content")))
            return {"success": True, "output": {"answer": answer}}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


@app.post("/api/test/qstash")
async def test_qstash():
    try:
        qstash = get_qstash()
        public_url = get_public_url()

        result = qstash.message.publish_json(
            url=f"{public_url}/api/callback/qstash-sanity-test",
            body={"test": True},
        )

        msg_id = result.message_id if hasattr(result, "message_id") else str(result)
        return {"success": True, "messageId": msg_id}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


dist_path = os.path.join(os.path.dirname(__file__), "..", "dist", "public")
if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(dist_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))
