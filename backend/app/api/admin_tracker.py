"""Admin Tracker: per-project weekly send status from subject rules + schedule in DB."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_admin_user
from app.config import get_settings
from app.db.models import Email, TeamProject, User
from app.db.session import get_db

router = APIRouter(prefix="/tracker", dependencies=[Depends(get_admin_user)])

TRACKER_SUBSTRING = "tracker"
TRACKER_DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
ISO_DOW_TO_KEY: dict[int, str] = {1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 7: "sun"}
KEY_TO_ISO_DOW = {v: k for k, v in ISO_DOW_TO_KEY.items()}


def _week_bounds_utc(now: datetime | None = None) -> tuple[datetime, datetime]:
    n = now or datetime.now(timezone.utc)
    if n.tzinfo is None:
        n = n.replace(tzinfo=timezone.utc)
    else:
        n = n.astimezone(timezone.utc)
    monday = (n - timedelta(days=n.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday_end = monday + timedelta(days=7) - timedelta(microseconds=1)
    return monday, sunday_end


def _like_fragment(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _emails_from_recipient_json(recipients) -> list[str]:
    """Graph-style recipient list: [{email}, or {emailAddress: {address}}]."""
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


def _tracker_watch_emails(db: Session) -> set[str]:
    """
    Emails that count as "oversight" when CC'd on a tracker: DB users with Admin or Manager role,
    plus ADMIN_EMAILS from env (same list as admin API gate).
    """
    s: set[str] = set()
    for (em,) in db.query(User.email).filter(User.role.in_(["Admin", "Manager"])).all():
        if em and str(em).strip():
            s.add(str(em).strip().lower())
    for part in (get_settings().admin_emails or "").split(","):
        e = part.strip().lower()
        if e:
            s.add(e)
    return s


def _cc_has_watch_email(cc_recipients, watch: set[str]) -> bool:
    if not watch:
        return False
    for em in _emails_from_recipient_json(cc_recipients):
        if em in watch:
            return True
    return False


def _normalize_schedule_days(raw) -> list[str]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[str] = []
    for x in raw:
        if not isinstance(x, str):
            continue
        k = x.strip().lower()
        if k in TRACKER_DAY_KEYS and k not in out:
            out.append(k)
    return out


def _dows_tracker_sent_for_project(
    db: Session,
    project: TeamProject,
    week_start: datetime,
    week_end: datetime,
    watch_emails: set[str],
) -> set[int]:
    """
    Return ISO weekdays (1=Mon .. 7=Sun) on which at least one email qualifies as this project's
    tracker: subject contains 'tracker' and project name (case-insensitive), and Cc includes at
    least one Admin/Manager user email or an address listed in ADMIN_EMAILS (so copies sent with
    leadership in CC count even when the ingested row is that mailbox).
    """
    name_pat = _like_fragment(project.name)
    if not name_pat:
        return set()

    subj = Email.subject
    conds = [
        Email.received_at >= week_start,
        Email.received_at <= week_end,
        subj.isnot(None),
        func.lower(subj).like(f"%{TRACKER_SUBSTRING}%", escape="\\"),
        func.lower(subj).like(f"%{name_pat.lower()}%", escape="\\"),
    ]

    q = db.query(Email.received_at, Email.cc_recipients).filter(and_(*conds))
    dows: set[int] = set()
    for received_at, cc_recipients in q.all():
        if not received_at:
            continue
        if not _cc_has_watch_email(cc_recipients, watch_emails):
            continue
        dt = received_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        iw = dt.isoweekday()  # Monday=1 .. Sunday=7
        if 1 <= iw <= 7:
            dows.add(iw)
    return dows


def _list_tracker_emails_for_project(
    db: Session,
    project: TeamProject,
    week_start: datetime,
    week_end: datetime,
    watch_emails: set[str],
    display_limit: int,
    fetch_cap: int = 2500,
) -> list[Email]:
    """Newest first; subject + Cc rules match tracker dashboard."""
    name_pat = _like_fragment(project.name)
    if not name_pat:
        return []

    subj = Email.subject
    conds = [
        Email.received_at >= week_start,
        Email.received_at <= week_end,
        subj.isnot(None),
        func.lower(subj).like(f"%{TRACKER_SUBSTRING}%", escape="\\"),
        func.lower(subj).like(f"%{name_pat.lower()}%", escape="\\"),
    ]
    rows = (
        db.query(Email)
        .filter(and_(*conds))
        .order_by(Email.received_at.desc())
        .limit(fetch_cap)
        .all()
    )
    out: list[Email] = []
    for e in rows:
        if _cc_has_watch_email(e.cc_recipients, watch_emails):
            out.append(e)
        if len(out) >= display_limit:
            break
    return out


class TrackerDayState(BaseModel):
    key: Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    label: str
    expected: bool = Field(description="Admin configured: tracker should be sent this weekday")
    sent: bool = Field(description="At least one qualifying email received this weekday (UTC week)")


class ProjectTrackerOut(BaseModel):
    projectId: str
    projectName: str
    teamName: str | None = None
    scheduleDays: list[str] = Field(default_factory=list)
    weekStartISO: str
    weekEndISO: str
    days: list[TrackerDayState]


class TrackerDashboardOut(BaseModel):
    projects: list[ProjectTrackerOut]


class TrackerSchedulePatch(BaseModel):
    scheduleDays: list[str] = Field(
        default_factory=list,
        description="Weekday keys: mon,tue,wed,thu,fri,sat,sun (lowercase)",
    )


class TrackerEmailItemOut(BaseModel):
    emailId: str
    subject: str | None = None
    receivedAt: str
    senderEmail: str
    mailboxOwnerEmail: str | None = None


class TrackerEmailsOut(BaseModel):
    projectId: str
    projectName: str
    weekStartISO: str
    weekEndISO: str
    emails: list[TrackerEmailItemOut]


DAY_LABELS = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}


@router.get("", response_model=TrackerDashboardOut)
def get_tracker_dashboard(db: Session = Depends(get_db)):
    week_start, week_end = _week_bounds_utc()
    watch_emails = _tracker_watch_emails(db)
    projects = (
        db.query(TeamProject)
        .options(joinedload(TeamProject.team))
        .order_by(TeamProject.updated_at.desc())
        .all()
    )
    out: list[ProjectTrackerOut] = []
    for p in projects:
        schedule = _normalize_schedule_days(getattr(p, "tracker_schedule_days", None))
        sent_dows = _dows_tracker_sent_for_project(db, p, week_start, week_end, watch_emails)
        days: list[TrackerDayState] = []
        for key in TRACKER_DAY_KEYS:
            iso = KEY_TO_ISO_DOW[key]
            days.append(
                TrackerDayState(
                    key=key,
                    label=DAY_LABELS[key],
                    expected=key in schedule,
                    sent=iso in sent_dows,
                )
            )
        team_name = p.team.name if getattr(p, "team", None) else None
        out.append(
            ProjectTrackerOut(
                projectId=p.id,
                projectName=p.name,
                teamName=team_name,
                scheduleDays=schedule,
                weekStartISO=week_start.isoformat().replace("+00:00", "Z"),
                weekEndISO=week_end.isoformat().replace("+00:00", "Z"),
                days=days,
            )
        )
    return TrackerDashboardOut(projects=out)


@router.get("/{project_id}/emails", response_model=TrackerEmailsOut)
def list_project_tracker_emails(
    project_id: str,
    days: int = Query(7, ge=1, le=365, description="Lookback window ending now (UTC), in days"),
    limit: int = Query(100, ge=1, le=300, description="Max rows after Cc filter"),
    db: Session = Depends(get_db),
):
    """Matching tracker mails for this project in the lookback window (newest first)."""
    p = db.query(TeamProject).filter(TeamProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    week_end = datetime.now(timezone.utc)
    week_start = week_end - timedelta(days=days)
    watch_emails = _tracker_watch_emails(db)
    rows = _list_tracker_emails_for_project(db, p, week_start, week_end, watch_emails, limit)
    items: list[TrackerEmailItemOut] = []
    for e in rows:
        ra = e.received_at
        if ra is None:
            continue
        ra_s = ra.isoformat().replace("+00:00", "Z") if hasattr(ra, "isoformat") else ""
        items.append(
            TrackerEmailItemOut(
                emailId=e.id,
                subject=e.subject,
                receivedAt=ra_s,
                senderEmail=(e.sender_email or "").strip() or "—",
                mailboxOwnerEmail=(e.mailbox_owner_email or None),
            )
        )
    return TrackerEmailsOut(
        projectId=p.id,
        projectName=p.name,
        weekStartISO=week_start.isoformat().replace("+00:00", "Z"),
        weekEndISO=week_end.isoformat().replace("+00:00", "Z"),
        emails=items,
    )


@router.patch("/{project_id}", response_model=ProjectTrackerOut)
def patch_tracker_schedule(
    project_id: str,
    body: TrackerSchedulePatch,
    db: Session = Depends(get_db),
):
    p = (
        db.query(TeamProject)
        .options(joinedload(TeamProject.team))
        .filter(TeamProject.id == project_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    schedule = _normalize_schedule_days(body.scheduleDays)
    p.tracker_schedule_days = schedule if schedule else None
    db.add(p)
    db.commit()
    db.refresh(p)

    week_start, week_end = _week_bounds_utc()
    watch_emails = _tracker_watch_emails(db)
    sent_dows = _dows_tracker_sent_for_project(db, p, week_start, week_end, watch_emails)
    days: list[TrackerDayState] = []
    for key in TRACKER_DAY_KEYS:
        iso = KEY_TO_ISO_DOW[key]
        days.append(
            TrackerDayState(
                key=key,
                label=DAY_LABELS[key],
                expected=key in schedule,
                sent=iso in sent_dows,
            )
        )
    team_name = p.team.name if getattr(p, "team", None) else None
    return ProjectTrackerOut(
        projectId=p.id,
        projectName=p.name,
        teamName=team_name,
        scheduleDays=schedule,
        weekStartISO=week_start.isoformat().replace("+00:00", "Z"),
        weekEndISO=week_end.isoformat().replace("+00:00", "Z"),
        days=days,
    )
