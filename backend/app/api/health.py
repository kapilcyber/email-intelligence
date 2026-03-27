from datetime import datetime
import time
from fastapi import APIRouter
from sqlalchemy import text
import redis
from app.config import get_settings
from app.db.session import engine
from app.graph.auth import get_access_token

router = APIRouter()


def _timed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000.0, 2)


def _db_status() -> dict:
    """DB status with latency and migration visibility; never raises."""
    start = time.perf_counter()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            migration_table = conn.execute(text("SELECT to_regclass('public.alembic_version')")).scalar()
            migration_status = "tracked" if migration_table else "missing"
        return {
            "status": "healthy",
            "latencyMs": _timed_ms(start),
            "migrationStatus": migration_status,
            "error": None,
        }
    except Exception as e:
        return {
            "status": "error",
            "latencyMs": _timed_ms(start),
            "migrationStatus": "unknown",
            "error": str(e),
        }


def _redis_status() -> dict:
    start = time.perf_counter()
    try:
        r = redis.from_url(get_settings().redis_url)
        r.ping()
        return {"status": "healthy", "latencyMs": _timed_ms(start), "error": None}
    except Exception as e:
        return {"status": "error", "latencyMs": _timed_ms(start), "error": str(e)}


def _graph_status() -> dict:
    """Graph status based on token acquisition (no expensive Graph data query)."""
    settings = get_settings()
    if not (settings.azure_tenant_id and settings.azure_client_id and settings.azure_client_secret):
        return {"status": "unknown", "latencyMs": None, "error": "Azure Graph credentials not configured"}
    start = time.perf_counter()
    try:
        token = get_access_token()
        if not token:
            return {"status": "error", "latencyMs": _timed_ms(start), "error": "No access token returned"}
        return {"status": "healthy", "latencyMs": _timed_ms(start), "error": None}
    except Exception as e:
        return {"status": "error", "latencyMs": _timed_ms(start), "error": str(e)}


def get_service_health_snapshot(include_graph: bool = True) -> dict:
    db_d = _db_status()
    redis_d = _redis_status()
    graph_d = _graph_status() if include_graph else {"status": "unknown", "latencyMs": None, "error": None}

    statuses = [db_d["status"], redis_d["status"]]
    if include_graph:
        statuses.append(graph_d["status"])

    if "error" in statuses:
        overall = "error"
    elif "unknown" in statuses:
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "services": {
            "database": db_d["status"],
            "redis": redis_d["status"],
            "graph": graph_d["status"],
        },
        "checks": {
            "database": db_d,
            "redis": redis_d,
            "graph": graph_d,
        },
    }


@router.get("/api/health")
def health():
    """Always returns 200 with status so frontend can show Operational/Degraded/Error."""
    snapshot = get_service_health_snapshot(include_graph=True)
    return {
        "status": snapshot["status"],
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0",
        "services": snapshot["services"],
        "checks": snapshot["checks"],
    }
