import os
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
