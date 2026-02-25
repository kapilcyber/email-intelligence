import logging
import time
import uuid
from datetime import datetime, timezone
from app.workers.celery_app import celery_app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import get_settings
from app.db.models import Base, Email, Attachment, Sender
from app.graph.auth import get_auth_headers
from app.ai.classifier import classify_email_content
import httpx
import redis

logger = logging.getLogger(__name__)

settings = get_settings()
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

_tables_ensured = False


def _ensure_tables():
    """Ensure DB tables exist once per worker process (avoids 'relation emails does not exist')."""
    global _tables_ensured
    if _tables_ensured:
        return
    from app.db import init_db
    init_db()
    _tables_ensured = True


def _normalize_message(user_id: str, graph_id: str) -> dict | None:
    # Request message with attachments expanded so we can store attachment metadata (name, type, size, isInline).
    url = f"https://graph.microsoft.com/v1.0/users/{user_id}/messages/{graph_id}"
    params = {"$expand": "attachments"}
    with httpx.Client(timeout=30.0) as client:
        r = client.get(url, headers=get_auth_headers(), params=params)
        if r.status_code != 200:
            return None
        return r.json()


def _parse_recipients(recipients: list) -> list[dict]:
    out = []
    for r in recipients or []:
        email = (r.get("emailAddress") or {})
        out.append({"email": email.get("address"), "name": email.get("name")})
    return out


def _parse_sent_at(sent_date_time: str | None):
    if not sent_date_time:
        return None
    try:
        return datetime.fromisoformat(sent_date_time.replace("Z", "+00:00"))
    except Exception:
        return None


def _ensure_sender(db, email_address: str, display_name: str | None) -> str | None:
    row = db.query(Sender).filter(Sender.email == email_address).first()
    if row:
        return row.id
    sender = Sender(email=email_address, display_name=display_name)
    db.add(sender)
    db.commit()
    db.refresh(sender)
    return sender.id


@celery_app.task(bind=True, name="app.workers.tasks.ingest_email_task", max_retries=5)
def ingest_email_task(
    self, resource: str, graph_id: str, user_id: str | None = None, folder_display_name: str | None = None
):
    """
    Celery task: fetch message from Graph, normalize, upsert into PostgreSQL.
    resource is e.g. Users('xxx')/Messages('yyy') — we need user id and message id.
    """
    if not user_id:
        user_id = _resource_to_user_id(resource)
    if not user_id:
        self.retry(countdown=60)
        return
    _ensure_tables()
    data = _normalize_message(user_id, graph_id)
    if not data:
        self.retry(countdown=60)
        return
    db = SessionLocal()
    try:
        message_id = data.get("internetMessageId") or data.get("id")
        if not message_id:
            return
        existing = db.query(Email).filter(Email.message_id == message_id).first()
        if existing:
            return
        sender_info = (data.get("sender") or {}).get("emailAddress") or {}
        sender_email = sender_info.get("address") or "unknown"
        sender_name = sender_info.get("name")
        sender_id = _ensure_sender(db, sender_email, sender_name)
        received = data.get("receivedDateTime")
        if received:
            try:
                received_dt = datetime.fromisoformat(received.replace("Z", "+00:00"))
            except Exception:
                received_dt = datetime.now(timezone.utc)
        else:
            received_dt = datetime.now(timezone.utc)
        folder = data.get("parentFolderId") or "inbox"
        # Use display name from backfill when known (e.g. "Inbox"); else avoid showing raw Graph folder ID
        if folder_display_name:
            folder_name = folder_display_name
        else:
            folder_name = (data.get("parentFolderId") or "").lower()
            if "inbox" in folder_name or folder == "inbox":
                folder_name = "Inbox"
            elif len(folder_name) > 40 and " " not in folder_name:
                folder_name = "Mail"  # opaque folder ID, avoid showing long string
        email = Email(
            graph_id=data.get("id"),
            message_id=message_id,
            conversation_id=data.get("conversationId"),
            subject=data.get("subject"),
            body_preview=data.get("bodyPreview"),
            body_content=data.get("body", {}).get("content") if isinstance(data.get("body"), dict) else None,
            body_content_type=(data.get("body") or {}).get("contentType") if isinstance(data.get("body"), dict) else None,
            sender_email=sender_email,
            sender_id=sender_id,
            sender_display_name=sender_name,
            cc_recipients=_parse_recipients(data.get("ccRecipients")),
            to_recipients=_parse_recipients(data.get("toRecipients")),
            received_at=received_dt,
            sent_at=_parse_sent_at(data.get("sentDateTime")),
            is_read=data.get("isRead", False),
            folder_id=folder,
            folder_name=folder_name or "Inbox",
            status="stored",
            raw_payload={k: v for k, v in data.items() if k not in ("body",)},
        )
        if getattr(Email, "processing_status", None) is not None:
            email.processing_status = "ingested"
        db.add(email)
        db.commit()
        db.refresh(email)
        email_id_to_classify = email.id
        for att in (data.get("attachments") or []):
            if att.get("@odata.type") == "#microsoft.graph.fileAttachment":
                a = Attachment(
                    email_id=email.id,
                    graph_attachment_id=att.get("id"),
                    name=att.get("name") or "attachment",
                    content_type=att.get("contentType"),
                    size=att.get("size"),
                    is_inline=att.get("isInline", False),
                )
                db.add(a)
        db.commit()
        if email_id_to_classify:
            classify_email_task.delay(email_id_to_classify)
    except Exception as e:
        db.rollback()
        raise self.retry(exc=e)
    finally:
        db.close()


def _record_ai_latency(latency_seconds: float) -> None:
    """Push AI latency to Redis for system health (keep last 100 samples)."""
    try:
        r = redis.from_url(settings.redis_url)
        key = "ai_latency_samples"
        r.lpush(key, str(latency_seconds))
        r.ltrim(key, 0, 99)
    except Exception:
        pass


@celery_app.task(bind=True, name="app.workers.tasks.classify_email_task", max_retries=3)
def classify_email_task(self, email_id: str):
    """
    Phase 2: Run AI classification on an email (summary, category, priority, reply suggestions).
    Called after ingest_email_task for new emails; can also be triggered manually for re-classification.
    Sets processing_status, ai_status, ai_error_message; logs correlation_id and latency.
    """
    _ensure_tables()
    correlation_id = str(uuid.uuid4())[:8]
    db = SessionLocal()
    try:
        email = db.query(Email).filter(Email.id == email_id).first()
        if not email:
            logger.warning("classify_email_task: email not found email_id=%s correlation_id=%s", email_id, correlation_id)
            return

        # Mark as in-progress (optional: could add 'classifying' state)
        if getattr(Email, "ai_status", None) is not None:
            email.ai_status = "pending"
            email.ai_error_message = None
            db.commit()

        start = time.perf_counter()
        result = classify_email_content(
            subject=email.subject,
            body_preview=email.body_preview,
            body_content=email.body_content,
            sender_email=email.sender_email or "",
            correlation_id=correlation_id,
        )
        latency = time.perf_counter() - start
        _record_ai_latency(latency)

        summary = result.get("summary")
        logger.info(
            "DB_SAVE_STATUS: correlation_id=%s email_id=%s has_summary=%s latency_sec=%.2f",
            correlation_id,
            email_id,
            summary is not None,
            latency,
        )
        if summary is None and (result.get("category") is None and result.get("priority_label") in (None, "Medium")):
            logger.warning(
                "DB_SAVE_STATUS: ai_returned_empty correlation_id=%s email_id=%s",
                correlation_id,
                email_id,
            )

        email.ai_summary = summary
        email.ai_category = result.get("category")
        email.ai_priority_score = result.get("priority_score")
        email.ai_priority_label = result.get("priority_label")
        email.ai_suggested_replies = result.get("suggested_replies") or []
        email.ai_processed_at = datetime.now(timezone.utc)
        email.ai_confidence_score = result.get("confidence_score")
        if getattr(Email, "ai_status", None) is not None:
            email.ai_status = "completed"
            email.ai_error_message = None
        if getattr(Email, "processing_status", None) is not None:
            email.processing_status = "classified"
        db.commit()
        logger.info(
            "DB_SAVE_STATUS: saved correlation_id=%s email_id=%s ai_status=completed",
            correlation_id,
            email_id,
        )
    except Exception as e:
        db.rollback()
        err_msg = str(e)
        logger.exception(
            "DB_SAVE_STATUS: failed correlation_id=%s email_id=%s error=%s",
            correlation_id,
            email_id,
            err_msg,
        )
        try:
            email = db.query(Email).filter(Email.id == email_id).first()
            if email:
                if getattr(Email, "ai_status", None) is not None:
                    email.ai_status = "failed"
                    email.ai_error_message = err_msg[:2000] if err_msg else None
                if getattr(Email, "processing_status", None) is not None:
                    email.processing_status = "failed"
                db.commit()
        except Exception:
            db.rollback()
        countdown = 2 ** self.request.retries
        raise self.retry(exc=e, countdown=min(countdown, 120))
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.backfill_classify_emails_task")
def backfill_classify_emails_task(limit: int = 500):
    """
    Enqueue classify_email_task for all emails that don't have AI classification yet.
    Use this to classify existing emails (ingested before Phase 2 or before OPENAI_API_KEY was set).
    limit: max number of emails to enqueue (default 500).
    """
    _ensure_tables()
    db = SessionLocal()
    try:
        rows = (
            db.query(Email.id)
            .filter(Email.ai_processed_at.is_(None))
            .order_by(Email.received_at.desc())
            .limit(limit)
            .all()
        )
        ids = [r[0] for r in rows]
        for email_id in ids:
            classify_email_task.delay(email_id)
        return {"ok": True, "enqueued": len(ids)}
    finally:
        db.close()


def _resource_to_user_id(resource: str) -> str | None:
    if "Users('" in resource or "Users(\"" in resource:
        import re
        m = re.search(r"Users\(['\"]([^'\"]+)['\"]\)", resource)
        if m:
            return m.group(1)
    return None


def get_ai_latency_avg_seconds() -> float | None:
    """Average of last AI classification latencies (seconds) from Redis."""
    try:
        r = redis.from_url(settings.redis_url)
        key = "ai_latency_samples"
        raw = r.lrange(key, 0, 99)
        if not raw:
            return None
        values = []
        for x in raw:
            if x is None:
                continue
            s = x.decode() if isinstance(x, bytes) else str(x)
            try:
                values.append(float(s))
            except ValueError:
                continue
        if not values:
            return None
        return sum(values) / len(values)
    except Exception:
        return None


def get_queue_stats() -> dict:
    try:
        r = redis.from_url(settings.redis_url)
        info = r.info("server")
        uptime = info.get("uptime_in_seconds", 0)
        pending = r.llen("celery")  # default queue length
        inspect = celery_app.control.inspect()
        active_list = inspect.active() or {}
        reserved_list = inspect.reserved() or {}
        active = sum(len(t) for t in active_list.values())
        reserved = sum(len(t) for t in reserved_list.values())
        active_workers = len(inspect.ping() or {})
        # On Windows/solo pool, ping() can be unreliable; if we see active/reserved tasks, a worker is running
        if active_workers == 0 and (active_list or reserved_list):
            active_workers = 1
        return {
            "pending": pending + reserved,
            "active": active,
            "failed": 0,
            "retry_count": 0,
            "worker_uptime": uptime,
            "active_workers": active_workers,
            "task_distribution": [],
        }
    except Exception:
        return {
            "pending": 0,
            "active": 0,
            "failed": 0,
            "retry_count": 0,
            "worker_uptime": 0,
            "active_workers": 0,
            "task_distribution": [],
        }


@celery_app.task(name="app.workers.tasks.backfill_emails_task")
def backfill_emails_task(user_id: str, folder_id: str = "inbox", days: int = 7):
    """
    Historical sync: last N days, or all messages when days <= 0.
    Paginates through Graph (follows @odata.nextLink) and enqueues all messages.
    """
    from datetime import timedelta

    base_url = f"https://graph.microsoft.com/v1.0/users/{user_id}/mailFolders/{folder_id}/messages"
    now_utc = datetime.now(timezone.utc)
    if days <= 0:
        since = "2000-01-01T00:00:00Z"
    elif days == 1:
        # Sync for today: from midnight today (UTC) to now — all of today's emails
        since = now_utc.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    else:
        since = (now_utc - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    # Newest first so recent emails are ingested first and show up quickly in the UI
    params = {"$top": 999, "$filter": f"receivedDateTime ge {since}", "$orderby": "receivedDateTime desc"}
    total_enqueued = 0

    with httpx.Client(timeout=60.0) as client:
        next_url: str | None = base_url
        next_params: dict | None = params

        while next_url:
            r = client.get(next_url, params=next_params, headers=get_auth_headers())
            if r.status_code != 200:
                return {"ok": False, "error": r.text, "enqueued": total_enqueued}
            data = r.json()
            value = data.get("value", [])
            for item in value:
                msg_id = item.get("id")
                if msg_id:
                    display_name = "Inbox" if folder_id == "inbox" else folder_id
                    ingest_email_task.delay(
                        f"Users('{user_id}')/Messages('{msg_id}')", msg_id, user_id, folder_display_name=display_name
                    )
                    total_enqueued += 1
            next_link = data.get("@odata.nextLink")
            next_url = next_link if isinstance(next_link, str) else None
            next_params = None  # nextLink already includes query params

    return {"ok": True, "enqueued": total_enqueued}
