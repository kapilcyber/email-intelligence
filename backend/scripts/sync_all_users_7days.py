"""
Sync last 7 days for all users in the DB, then run classification (escalation + leads).
Run from backend: python scripts/sync_all_users_7days.py
Requires: Celery worker running to process the enqueued tasks.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    from app.config import get_settings
    from app.db.session import init_db, SessionLocal
    from app.db.models import User
    from app.workers.tasks import backfill_emails_task, backfill_classify_emails_task
    from app.workers.user_queue import user_queue_incr

    get_settings()
    init_db()

    db = SessionLocal()
    try:
        users = db.query(User.email).filter(User.email.isnot(None)).all()
        emails = [row[0].strip().lower() for row in users if row[0] and "@" in row[0]]
    finally:
        db.close()

    if not emails:
        print("No user emails found in users table. Add users first (e.g. scripts/seed_users.py).")
        return 1

    print(f"Found {len(emails)} users. Enqueueing sync (last 7 days) for each...")
    for email in emails:
        user_queue_incr(email, 1)
        backfill_emails_task.delay(email, "inbox", 7)
        print(f"  Enqueued backfill: {email}")

    print("Enqueueing classification backfill for all mailboxes (escalation + leads)...")
    backfill_classify_emails_task.delay(limit=2000, mailbox_owner_email=None)
    print("Done. Ensure a Celery worker is running to process the tasks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
