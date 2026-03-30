from fastapi import APIRouter, Depends
from app.workers.tasks import get_queue_stats_for_user
from app.api.deps import get_current_user_email

router = APIRouter()


@router.get("/status")
def queue_status(current_user_email: str = Depends(get_current_user_email)):
    """Per-mailbox queue backlog (your enqueued work), not the whole Celery broker."""
    stats = get_queue_stats_for_user(current_user_email)
    return {
        "pending": stats.get("pending", 0),
        "active": stats.get("active", 0),
        "failed": stats.get("failed", 0),
        "retryCount": stats.get("retry_count", 0),
        "workerUptime": stats.get("worker_uptime", 0),
        "activeWorkers": stats.get("active_workers", 0),
        "taskDistribution": stats.get("task_distribution", []),
    }
