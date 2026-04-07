"""Admin Review metrics: escalation replies + project tracker sends by user."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session, aliased

from app.api.admin_access import actor_manager_scope_mailboxes, manager_actor_row
from app.api.deps import get_admin_or_manager_user, get_current_user_email
from app.config import get_settings
from app.db.models import Email, TeamProject, User
from app.db.session import get_db

router = APIRouter(prefix="/review", dependencies=[Depends(get_admin_or_manager_user)])

_TRACKER_DAY_KEYS = frozenset({"mon", "tue", "wed", "thu", "fri", "sat", "sun"})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _since(days: int) -> datetime:
    return _utcnow() - timedelta(days=days)


def _excluded_mailboxes_for_user_lists() -> set[str]:
    s = get_settings()
    excluded = set()
    if getattr(s, "mailbox_email", None) and str(s.mailbox_email).strip():
        excluded.add(str(s.mailbox_email).strip().lower())
    excluded.add("techbank@cachedigitech.com")
    return excluded


def _emails_from_recipient_json(recipients) -> list[str]:
    if not recipients or not isinstance(recipients, list):
        return []
    out: list[str] = []
    for rec in recipients:
        if not isinstance(rec, dict):
            continue
        addr = rec.get("email")
        if not addr and isinstance(rec.get("emailAddress"), dict):
            addr = rec["emailAddress"].get("address")
        if addr and str(addr).strip():
            out.append(str(addr).strip().lower())
    return out


def _review_watch_emails(db: Session) -> set[str]:
    s: set[str] = set()
    for (em,) in db.query(User.email).filter(User.role.in_(["Admin", "Manager"])).all():
        if em and str(em).strip():
            s.add(str(em).strip().lower())
    for part in (get_settings().admin_emails or "").split(","):
        e = part.strip().lower()
        if e:
            s.add(e)
    return s


class ReviewEscalationUserOut(BaseModel):
    email: str
    displayName: str | None = Field(None, alias="displayName")
    escalationCount: int = Field(0, alias="escalationCount")
    repliedCount: int = Field(0, alias="repliedCount")
    pendingCount: int = Field(0, alias="pendingCount")

    model_config = {"populate_by_name": True}


class ReviewLeadUserOut(BaseModel):
    email: str
    displayName: str | None = Field(None, alias="displayName")
    leadCount: int = Field(0, alias="leadCount")
    repliedCount: int = Field(0, alias="repliedCount")
    pendingCount: int = Field(0, alias="pendingCount")

    model_config = {"populate_by_name": True}


class ReviewProjectTrackerUserOut(BaseModel):
    email: str
    displayName: str | None = Field(None, alias="displayName")
    trackerCount: int = Field(0, alias="trackerCount")
    hasSentTracker: bool = Field(False, alias="hasSentTracker")
    trackersSetCount: int = Field(
        0,
        alias="trackersSetCount",
        description="Projects where an admin set a per-member tracker deadline for this user.",
    )

    model_config = {"populate_by_name": True}


@router.get("/escalation-replies", response_model=list[ReviewEscalationUserOut])
def review_escalation_replies(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    actor_email: str = Depends(get_current_user_email),
):
    since = _since(days)
    excluded = _excluded_mailboxes_for_user_lists()
    users = [u for u in db.query(User).order_by(User.email).all() if (u.email or "").strip().lower() not in excluded]
    scope = actor_manager_scope_mailboxes(db, actor_email)
    if scope is not None:
        users = [u for u in users if (u.email or "").strip().lower() in scope]

    E2 = aliased(Email)
    out: list[ReviewEscalationUserOut] = []
    for u in users:
        base = db.query(Email).filter(
            Email.is_escalation == True,
            Email.mailbox_owner_email == u.email,
            Email.received_at >= since,
        )
        esc_count = base.count()
        if hasattr(Email, "conversation_id") and hasattr(Email, "folder_id") and hasattr(Email, "folder_name"):
            sent_match = or_(
                E2.folder_id == "sentitems",
                func.coalesce(func.lower(E2.folder_name), "").like("%sent%"),
            )
            replied_exists = exists().where(
                E2.conversation_id == Email.conversation_id,
                E2.mailbox_owner_email == u.email,
                sent_match,
            )
            replied_count = (
                db.query(func.count(func.distinct(Email.conversation_id)))
                .filter(
                    Email.is_escalation == True,
                    Email.mailbox_owner_email == u.email,
                    Email.received_at >= since,
                    Email.conversation_id.isnot(None),
                    replied_exists,
                )
                .scalar()
                or 0
            )
        else:
            replied_count = 0
        out.append(
            ReviewEscalationUserOut(
                email=u.email,
                displayName=u.display_name,
                escalationCount=esc_count,
                repliedCount=replied_count,
                pendingCount=max(esc_count - replied_count, 0),
            )
        )
    out.sort(key=lambda x: (x.pendingCount, x.escalationCount, x.email), reverse=True)
    return out


@router.get("/lead-replies", response_model=list[ReviewLeadUserOut])
def review_lead_replies(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    actor_email: str = Depends(get_current_user_email),
):
    """Per-user sales lead counts and reply status (same conversation / sent folder heuristic as escalations)."""
    since = _since(days)
    excluded = _excluded_mailboxes_for_user_lists()
    users = [u for u in db.query(User).order_by(User.email).all() if (u.email or "").strip().lower() not in excluded]
    scope = actor_manager_scope_mailboxes(db, actor_email)
    if scope is not None:
        users = [u for u in users if (u.email or "").strip().lower() in scope]

    E2 = aliased(Email)
    out: list[ReviewLeadUserOut] = []
    for u in users:
        base = db.query(Email).filter(
            Email.lead_label.isnot(None),
            Email.lead_label != "",
            Email.mailbox_owner_email == u.email,
            Email.received_at >= since,
        )
        lead_count = base.count()
        if hasattr(Email, "conversation_id") and hasattr(Email, "folder_id") and hasattr(Email, "folder_name"):
            sent_match = or_(
                E2.folder_id == "sentitems",
                func.coalesce(func.lower(E2.folder_name), "").like("%sent%"),
            )
            replied_exists = exists().where(
                E2.conversation_id == Email.conversation_id,
                E2.mailbox_owner_email == u.email,
                sent_match,
            )
            replied_count = (
                db.query(func.count(func.distinct(Email.conversation_id)))
                .filter(
                    Email.lead_label.isnot(None),
                    Email.lead_label != "",
                    Email.mailbox_owner_email == u.email,
                    Email.received_at >= since,
                    Email.conversation_id.isnot(None),
                    replied_exists,
                )
                .scalar()
                or 0
            )
        else:
            replied_count = 0
        out.append(
            ReviewLeadUserOut(
                email=u.email,
                displayName=u.display_name,
                leadCount=lead_count,
                repliedCount=replied_count,
                pendingCount=max(lead_count - replied_count, 0),
            )
        )
    out.sort(key=lambda x: (x.pendingCount, x.leadCount, x.email), reverse=True)
    return out


@router.get("/project-tracker", response_model=list[ReviewProjectTrackerUserOut])
def review_project_tracker(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    actor_email: str = Depends(get_current_user_email),
):
    since = _since(days)
    excluded = _excluded_mailboxes_for_user_lists()
    users = [u for u in db.query(User).order_by(User.email).all() if (u.email or "").strip().lower() not in excluded]
    scope = actor_manager_scope_mailboxes(db, actor_email)
    if scope is not None:
        users = [u for u in users if (u.email or "").strip().lower() in scope]
    if scope is None:
        project_rows = db.query(TeamProject).all()
    else:
        mgr = manager_actor_row(db, actor_email)
        if not mgr or not mgr.team_id:
            project_rows = []
        else:
            project_rows = db.query(TeamProject).filter(TeamProject.team_id == mgr.team_id).all()
    projects = [str(p.name).strip().lower() for p in project_rows if getattr(p, "name", None)]
    projects = [p for p in projects if p]
    watch = _review_watch_emails(db)

    set_counts: defaultdict[str, int] = defaultdict(int)
    user_cache: dict[str, User | None] = {}
    for proj in project_rows:
        raw = getattr(proj, "tracker_member_deadline_days", None)
        if not isinstance(raw, dict):
            continue
        for uid_raw, v in raw.items():
            uids = str(uid_raw).strip()
            if not uids or not isinstance(v, str):
                continue
            if v.strip().lower() not in _TRACKER_DAY_KEYS:
                continue
            if uids not in user_cache:
                user_cache[uids] = db.query(User).filter(User.id == uids).first()
            u = user_cache[uids]
            if not u or not (u.email or "").strip():
                continue
            el = (u.email or "").strip().lower()
            if el in excluded:
                continue
            if scope is not None and el not in scope:
                continue
            set_counts[el] += 1

    counts: dict[str, int] = {}
    if projects and watch:
        rows = (
            db.query(Email.sender_email, Email.subject, Email.cc_recipients)
            .filter(
                Email.received_at >= since,
                Email.subject.isnot(None),
                func.lower(Email.subject).like("%tracker%"),
            )
            .order_by(Email.received_at.desc())
            .limit(6000)
            .all()
        )
        for sender_email, subject, cc_recipients in rows:
            s = (subject or "").lower()
            if not any(pn in s for pn in projects):
                continue
            cc_list = _emails_from_recipient_json(cc_recipients)
            if not any(cc in watch for cc in cc_list):
                continue
            se = (sender_email or "").strip().lower()
            if not se:
                continue
            counts[se] = counts.get(se, 0) + 1

    out = [
        ReviewProjectTrackerUserOut(
            email=u.email,
            displayName=u.display_name,
            trackerCount=counts.get((u.email or "").strip().lower(), 0),
            hasSentTracker=counts.get((u.email or "").strip().lower(), 0) > 0,
            trackersSetCount=set_counts.get((u.email or "").strip().lower(), 0),
        )
        for u in users
    ]
    out.sort(key=lambda x: (x.trackerCount, x.trackersSetCount, x.email), reverse=True)
    return out
