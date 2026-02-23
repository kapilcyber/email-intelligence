from fastapi import APIRouter
from app.workers.tasks import get_queue_stats

router = APIRouter()


@router.get("/status")
def queue_status():
    stats = get_queue_stats()
    return {
        "pending": stats.get("pending", 0),
        "active": stats.get("active", 0),
        "failed": stats.get("failed", 0),
        "retryCount": stats.get("retry_count", 0),
        "workerUptime": stats.get("worker_uptime", 0),
        "taskDistribution": stats.get("task_distribution", []),
    }
