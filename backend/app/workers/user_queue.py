"""
Per-mailbox Celery work tracking in Redis.

We INCR when a user-scoped task is enqueued and DECR when it finishes (terminal state only),
so dashboard /queue metrics show that user's backlog instead of the whole broker list.
"""
from __future__ import annotations

import ast
import logging
import re
from typing import Any

import redis
from celery.signals import task_postrun

from app.config import get_settings
from app.db.session import SessionLocal
from app.db.models import Email

logger = logging.getLogger(__name__)

KEY_PREFIX = "user_queue_outstanding:"

# Tasks that participate in per-user counting (must match Celery task names).
TRACKED_TASK_NAMES = frozenset(
    {
        "app.workers.tasks.ingest_email_task",
        "app.workers.tasks.ingest_email_chunk_task",
        "app.workers.tasks.classify_email_task",
        "app.workers.tasks.notify_sales_lead_task",
        "app.workers.tasks.backfill_emails_task",
    }
)


def normalize_mailbox_key(user_id: str | None) -> str | None:
    """Match ingest_email_task mailbox_norm: lower if email-like, else strip."""
    if not user_id or not str(user_id).strip():
        return None
    raw = str(user_id).strip()
    return raw.lower() if "@" in raw else raw


def resource_to_user_id(resource: str | None) -> str | None:
    if not resource:
        return None
    m = re.search(r"Users\(['\"]([^'\"]+)['\"]\)", resource)
    return m.group(1) if m else None


def user_queue_incr(mailbox_key: str | None, n: int = 1) -> None:
    if not mailbox_key or n <= 0:
        return
    try:
        r = redis.from_url(get_settings().redis_url)
        r.incrby(f"{KEY_PREFIX}{mailbox_key}", n)
    except Exception as e:
        logger.debug("user_queue_incr failed: %s", e)


def user_queue_decr(mailbox_key: str | None, n: int = 1) -> None:
    if not mailbox_key or n <= 0:
        return
    try:
        r = redis.from_url(get_settings().redis_url)
        key = f"{KEY_PREFIX}{mailbox_key}"
        newv = r.decrby(key, n)
        if newv < 0:
            r.set(key, 0)
    except Exception as e:
        logger.debug("user_queue_decr failed: %s", e)


def user_queue_get(mailbox_key: str | None) -> int:
    if not mailbox_key:
        return 0
    try:
        r = redis.from_url(get_settings().redis_url)
        raw = r.get(f"{KEY_PREFIX}{mailbox_key}")
        if raw is None:
            return 0
        return int(raw.decode() if isinstance(raw, bytes) else raw)
    except Exception:
        return 0


def _coerce_seq(val: Any) -> tuple | list:
    if isinstance(val, (list, tuple)):
        return val
    if isinstance(val, str):
        try:
            out = ast.literal_eval(val)
            return out if isinstance(out, (list, tuple)) else ()
        except Exception:
            return ()
    return ()


def _coerce_kwargs(val: Any) -> dict:
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            out = ast.literal_eval(val)
            return out if isinstance(out, dict) else {}
        except Exception:
            return {}
    return {}


def mailbox_from_tracked_task(task_name: str, args: Any, kwargs: Any) -> str | None:
    """Resolve mailbox key for decrement / inspect matching."""
    args = _coerce_seq(args)
    kwargs = _coerce_kwargs(kwargs)

    if task_name == "app.workers.tasks.ingest_email_task":
        user_id = kwargs.get("user_id")
        if user_id is None and len(args) > 2:
            user_id = args[2]
        resource = args[0] if args else kwargs.get("resource")
        uid = user_id or resource_to_user_id(resource)
        return normalize_mailbox_key(uid)

    if task_name == "app.workers.tasks.ingest_email_chunk_task":
        uid = args[0] if args else kwargs.get("user_id")
        return normalize_mailbox_key(uid)

    if task_name == "app.workers.tasks.classify_email_task":
        mb = kwargs.get("mailbox_owner_email")
        if mb:
            return normalize_mailbox_key(str(mb))
        email_id = args[0] if args else None
        if not email_id:
            return None
        db = SessionLocal()
        try:
            row = db.query(Email.mailbox_owner_email).filter(Email.id == email_id).first()
            if not row or row[0] is None:
                return None
            return normalize_mailbox_key(str(row[0]))
        finally:
            db.close()

    if task_name == "app.workers.tasks.notify_sales_lead_task":
        mb = kwargs.get("mailbox_owner_email")
        if mb:
            return normalize_mailbox_key(str(mb))
        email_id = args[0] if args else None
        if not email_id:
            return None
        db = SessionLocal()
        try:
            row = db.query(Email.mailbox_owner_email).filter(Email.id == email_id).first()
            if not row or row[0] is None:
                return None
            return normalize_mailbox_key(str(row[0]))
        finally:
            db.close()

    if task_name == "app.workers.tasks.backfill_emails_task":
        uid = args[0] if args else kwargs.get("user_id")
        return normalize_mailbox_key(uid)

    return None


def _terminal_decrement(retval: Any, state: str | None) -> bool:
    """Do not decrement when Celery is about to retry."""
    try:
        from celery.exceptions import Retry

        if isinstance(retval, Retry):
            return False
    except ImportError:
        pass
    if state == "RETRY":
        return False
    return True


@task_postrun.connect(weak=False)
def _user_queue_task_postrun(
    sender: Any = None,
    task_id: str | None = None,
    task: Any = None,
    args: Any = None,
    kwargs: Any = None,
    retval: Any = None,
    state: str | None = None,
    **extra: Any,
) -> None:
    del task_id, task, extra
    if not sender:
        return
    name = getattr(sender, "name", None) or ""
    if name not in TRACKED_TASK_NAMES:
        return
    if not _terminal_decrement(retval, state):
        return
    mb = mailbox_from_tracked_task(name, args, kwargs)
    if mb:
        if name == "app.workers.tasks.ingest_email_chunk_task":
            args = _coerce_seq(args)
            kwargs = _coerce_kwargs(kwargs)
            gids = args[2] if len(args) > 2 else kwargs.get("graph_ids")
            n = len(gids) if isinstance(gids, (list, tuple)) else 1
            user_queue_decr(mb, max(1, n))
        else:
            user_queue_decr(mb, 1)


def count_active_reserved_for_mailbox(mailbox_key: str | None, celery_app: Any) -> int:
    """Best-effort: running + reserved Celery tasks attributed to this mailbox."""
    if not mailbox_key:
        return 0
    try:
        inspect = celery_app.control.inspect()
        active_list = inspect.active() or {}
        reserved_list = inspect.reserved() or {}
        n = 0
        for bucket in (active_list, reserved_list):
            for tasks in bucket.values():
                for t in tasks or []:
                    tname = t.get("name") or ""
                    if tname not in TRACKED_TASK_NAMES:
                        continue
                    mb = mailbox_from_tracked_task(tname, t.get("args"), t.get("kwargs"))
                    if mb == mailbox_key:
                        n += 1
        return n
    except Exception:
        return 0
