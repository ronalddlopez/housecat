from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.config import get_redis
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/sync-user")
async def sync_user(request: Request):
    """Sync Clerk user data to Redis."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(content={"error": "Invalid JSON"}, status_code=400)

    user_id = body.get("userId")
    email = body.get("email")
    if not user_id or not email:
        return JSONResponse(
            content={"error": "userId and email are required"}, status_code=400
        )

    redis = get_redis()
    redis.hset(
        f"user:{user_id}",
        values={
            "userId": user_id,
            "email": email,
            "firstName": body.get("firstName") or "",
            "lastName": body.get("lastName") or "",
            "lastSync": datetime.now(timezone.utc).isoformat(),
        },
    )
    redis.sadd("users:all", user_id)

    return {"status": "synced", "userId": user_id}
