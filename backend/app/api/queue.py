from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from app.workers.tasks import get_queue_stats_for_user
from app.api.deps import get_current_user_email
from app.db.session import get_db
from app.db.models import Email

router = APIRouter()


def _mailbox_ai_counts(db: Session, mailbox: str) -> tuple[int, int, int]:
    """(pending, completed, failed) for AI classification in this mailbox (ground truth vs Redis queue counter)."""
    m = (mailbox or "").strip().lower()
    if not m:
        return (0, 0, 0)
    try:
        base = db.query(Email).filter(
            Email.mailbox_owner_email.isnot(None),
            func.lower(Email.mailbox_owner_email) == m,
            Email.deleted_at.is_(None),
        )
        pending = base.filter(Email.ai_status == "pending").count()
        completed = base.filter(Email.ai_status == "completed").count()
        failed = base.filter(Email.ai_status == "failed").count()
        return (pending, completed, failed)
    except (OperationalError, Exception):
        return (0, 0, 0)


@router.get("/status")
def queue_status(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Per-mailbox queue backlog (your enqueued work), not the whole Celery broker."""
    stats = get_queue_stats_for_user(current_user_email)
    ai_pending, ai_completed, ai_failed = _mailbox_ai_counts(db, current_user_email)
    return {
        "pending": stats.get("pending", 0),
        "active": stats.get("active", 0),
        "failed": stats.get("failed", 0),
        "retryCount": stats.get("retry_count", 0),
        "workerUptime": stats.get("worker_uptime", 0),
        "activeWorkers": stats.get("active_workers", 0),
        "taskDistribution": stats.get("task_distribution", []),
        "mailboxAiPending": ai_pending,
        "mailboxAiCompleted": ai_completed,
        "mailboxAiFailed": ai_failed,
    }
