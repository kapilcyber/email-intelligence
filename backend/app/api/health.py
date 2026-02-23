from datetime import datetime
from fastapi import APIRouter
from sqlalchemy import create_engine, text
import redis
from app.config import get_settings

router = APIRouter()


def _db_status() -> str:
    """Check DB without using get_db so health never 500s."""
    try:
        settings = get_settings()
        engine = create_engine(settings.database_url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "healthy"
    except Exception:
        return "error"


def _redis_status() -> str:
    try:
        r = redis.from_url(get_settings().redis_url)
        r.ping()
        return "healthy"
    except Exception:
        return "error"


@router.get("/api/health")
def health():
    """Always returns 200 with status so frontend can show Operational/Degraded/Error."""
    db_s = _db_status()
    redis_s = _redis_status()
    status = "healthy" if (db_s == "healthy" and redis_s == "healthy") else "degraded"
    if db_s == "error" or redis_s == "error":
        status = "error"
    return {
        "status": status,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "services": {
            "database": db_s,
            "redis": redis_s,
            "graph": "healthy",
        },
    }
