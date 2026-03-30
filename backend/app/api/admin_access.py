"""Shared admin/manager access helpers for scoping list and mailbox APIs."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import User


def is_admin_actor(db: Session, actor_email: str) -> bool:
    settings = get_settings()
    admin_list = [e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()]
    email_l = (actor_email or "").strip().lower()
    if admin_list and email_l in admin_list:
        return True
    user_row = db.query(User).filter(User.email == email_l).first()
    return bool(user_row and (user_row.role or "") == "Admin")


def manager_actor_row(db: Session, actor_email: str) -> User | None:
    email_l = (actor_email or "").strip().lower()
    user_row = db.query(User).filter(User.email == email_l).first()
    if user_row and (user_row.role or "") == "Manager":
        return user_row
    return None


def manager_scope_mailboxes(db: Session, mgr: User) -> set[str]:
    """Lowercase mailbox owner emails: manager + same team + direct reports."""
    emails: set[str] = set()
    if mgr.email and str(mgr.email).strip():
        emails.add(str(mgr.email).strip().lower())
    tid = getattr(mgr, "team_id", None)
    if tid:
        for (em,) in db.query(User.email).filter(User.team_id == tid).all():
            if em and str(em).strip():
                emails.add(str(em).strip().lower())
    mid = getattr(mgr, "id", None)
    if mid:
        for (em,) in db.query(User.email).filter(User.manager_id == mid).all():
            if em and str(em).strip():
                emails.add(str(em).strip().lower())
    return emails


def actor_manager_scope_mailboxes(db: Session, actor_email: str) -> set[str] | None:
    """
    None = full access (admin / env allowlist).
    Non-empty or empty set = manager scope (allowed mailbox emails only).
    """
    if is_admin_actor(db, actor_email):
        return None
    mgr = manager_actor_row(db, actor_email)
    if not mgr:
        return None
    return manager_scope_mailboxes(db, mgr)


def assert_mailbox_in_manager_scope(db: Session, actor_email: str, mailbox_lower: str) -> None:
    scope = actor_manager_scope_mailboxes(db, actor_email)
    if scope is None:
        return
    m = (mailbox_lower or "").strip().lower()
    if m not in scope:
        raise HTTPException(status_code=403, detail="You can only view mailboxes for your team or your reports")
