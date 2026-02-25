from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from app.db.session import get_db
from app.db.models import Email
from app.workers.tasks import get_queue_stats
from app.api.deps import get_current_user_email

router = APIRouter()


@router.get("/metrics")
def dashboard_metrics(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        base = db.query(Email).filter(Email.mailbox_owner_email == current_user_email)
        emails_today = base.filter(Email.received_at >= today_start).count()
    except (OperationalError, Exception):
        emails_today = 0
    queue_stats = get_queue_stats()

    total_emails = 0
    total_classified = 0
    category_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}

    try:
        base = db.query(Email).filter(Email.mailbox_owner_email == current_user_email)
        total_emails = base.count()
        total_classified = base.filter(Email.ai_processed_at.isnot(None)).count()
        ai_failure_count = 0
        if hasattr(Email, "ai_status"):
            ai_failure_count = base.filter(Email.ai_status == "failed").count()
        for row in (
            base.filter(Email.ai_category.isnot(None))
            .with_entities(Email.ai_category, func.count(Email.id))
            .group_by(Email.ai_category)
        ):
            category_counts[str(row[0])] = row[1]
        for row in (
            base.filter(Email.ai_priority_label.isnot(None))
            .with_entities(Email.ai_priority_label, func.count(Email.id))
            .group_by(Email.ai_priority_label)
        ):
            priority_counts[str(row[0])] = row[1]
    except (OperationalError, Exception):
        pass

    return {
        "emailsIngestedToday": emails_today,
        "queueSize": queue_stats.get("pending", 0),
        "activeWorkers": queue_stats.get("active_workers", 0),
        "totalEmails": total_emails,
        "totalClassified": total_classified,
        "aiFailureCount": ai_failure_count,
        "categoryCounts": category_counts,
        "priorityCounts": priority_counts,
    }
