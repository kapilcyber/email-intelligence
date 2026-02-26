from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import case, func
from sqlalchemy.exc import OperationalError
from app.db.session import get_db
from app.db.models import Email
from app.workers.tasks import get_queue_stats

router = APIRouter()


@router.get("/metrics")
def dashboard_metrics(db: Session = Depends(get_db)):
    queue_stats = get_queue_stats()
    emails_today = 0
    total_emails = 0
    total_classified = 0
    ai_failure_count = 0
    category_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}

    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        row = db.query(
            func.count(case((Email.received_at >= today_start, 1))).label("emails_today"),
            func.count(Email.id).label("total"),
            func.count(case((Email.ai_processed_at.isnot(None), 1))).label("classified"),
            func.count(case((Email.ai_status == "failed", 1))).label("ai_failures"),
        ).select_from(Email).first()
        if row:
            emails_today = row[0] or 0
            total_emails = row[1] or 0
            total_classified = row[2] or 0
            ai_failure_count = row[3] or 0

        for group_row in db.query(Email.ai_category, func.count(Email.id)).filter(
            Email.ai_category.isnot(None)
        ).group_by(Email.ai_category):
            category_counts[str(group_row[0])] = group_row[1]
        for group_row in db.query(Email.ai_priority_label, func.count(Email.id)).filter(
            Email.ai_priority_label.isnot(None)
        ).group_by(Email.ai_priority_label):
            priority_counts[str(group_row[0])] = group_row[1]
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
