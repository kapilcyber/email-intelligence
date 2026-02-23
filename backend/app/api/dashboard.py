from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from app.db.session import get_db
from app.db.models import Email
from app.workers.tasks import get_queue_stats

router = APIRouter()


@router.get("/metrics")
def dashboard_metrics(db: Session = Depends(get_db)):
    try:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        emails_today = db.query(func.count(Email.id)).filter(Email.received_at >= today_start).scalar() or 0
    except (OperationalError, Exception):
        emails_today = 0
    queue_stats = get_queue_stats()

    total_emails = 0
    total_classified = 0
    category_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}

    try:
        total_emails = db.query(func.count(Email.id)).scalar() or 0
        total_classified = (
            db.query(func.count(Email.id)).filter(Email.ai_processed_at.isnot(None)).scalar() or 0
        )
        ai_failure_count = 0
        if hasattr(Email, "ai_status"):
            ai_failure_count = (
                db.query(func.count(Email.id)).filter(Email.ai_status == "failed").scalar() or 0
            )
        for row in db.query(Email.ai_category, func.count(Email.id)).filter(
            Email.ai_category.isnot(None)
        ).group_by(Email.ai_category):
            category_counts[str(row[0])] = row[1]
        for row in db.query(Email.ai_priority_label, func.count(Email.id)).filter(
            Email.ai_priority_label.isnot(None)
        ).group_by(Email.ai_priority_label):
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
