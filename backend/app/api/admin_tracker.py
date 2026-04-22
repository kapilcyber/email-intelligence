"""Admin Tracker: per-project weekly send status from subject rules + schedule in DB."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, not_
from sqlalchemy.orm import Session, joinedload

from app.api.admin_access import actor_manager_scope_mailboxes, manager_actor_row
from app.api.deps import get_admin_or_manager_user, get_current_user_email
from app.config import get_settings
from app.db.models import Email, ProjectAssignment, TeamProject, User
from app.db.session import get_db

router = APIRouter(prefix="/tracker", dependencies=[Depends(get_admin_or_manager_user)])

TRACKER_SUBSTRING = "tracker"
TRACKER_DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
ISO_DOW_TO_KEY: dict[int, str] = {1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 7: "sun"}
KEY_TO_ISO_DOW = {v: k for k, v in ISO_DOW_TO_KEY.items()}

# Tracker dashboard lists active projects only (workflow terminal / hidden states).
_TRACKER_DASHBOARD_EXCLUDED_STATUSES = ("completed", "archived")


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


def _utc_isoweekday(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoweekday()


def _qualifying_tracker_rows_project_week(
    db: Session,
    project: TeamProject,
    week_start: datetime,
    week_end: datetime,
    watch_emails: set[str],
) -> list[tuple[datetime, str]]:
    """
    Qualifying tracker rows in the window: subject has tracker + project name, Cc has watch email,
    returns (received_at, sender_lower) per row.
    """
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

    out: list[tuple[datetime, str]] = []
    for received_at, sender_email, cc_recipients in (
        db.query(Email.received_at, Email.sender_email, Email.cc_recipients).filter(and_(*conds)).all()
    ):
        if not received_at:
            continue
        if not _cc_has_watch_email(cc_recipients, watch_emails):
            continue
        se = (sender_email or "").strip().lower()
        if not se:
            continue
        out.append((received_at, se))
    return out


def _dows_tracker_sent_for_project(
    db: Session,
    project: TeamProject,
    week_start: datetime,
    week_end: datetime,
    watch_emails: set[str],
) -> set[int]:
    """
    Return ISO weekdays (1=Mon .. 7=Sun) on which at least one qualifying tracker was received.
    """
    rows = _qualifying_tracker_rows_project_week(db, project, week_start, week_end, watch_emails)
    dows: set[int] = set()
    for ra, _ in rows:
        iw = _utc_isoweekday(ra)
        if 1 <= iw <= 7:
            dows.add(iw)
    return dows


def _normalize_member_deadline_map(raw) -> dict[str, str]:
    if not raw or not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        uid = str(k).strip() if k is not None else ""
        if not uid or not isinstance(v, str):
            continue
        day = v.strip().lower()
        if day in TRACKER_DAY_KEYS:
            out[uid] = day
    return out


def _member_schedule_override_for_out(raw, uid: str) -> list[str] | None:
    """None = inherit project tracker_schedule_days; list (maybe empty) = explicit override."""
    if not raw or not isinstance(raw, dict):
        return None
    u = (uid or "").strip()
    if not u:
        return None
    if u not in raw and str(u) not in raw:
        return None
    v = raw[u] if u in raw else raw.get(str(u))
    if not isinstance(v, list):
        return None
    return _normalize_schedule_days(v)


def _member_met_deadline(
    rows: list[tuple[datetime, str]],
    member_email_lower: str,
    deadline_before_key: str,
) -> bool:
    """True if member sent at least one qualifying tracker on a weekday strictly before deadline_before_key (UTC)."""
    if deadline_before_key not in KEY_TO_ISO_DOW:
        return False
    d_iso = KEY_TO_ISO_DOW[deadline_before_key]
    for ra, se in rows:
        if se != member_email_lower:
            continue
        if _utc_isoweekday(ra) < d_iso:
            return True
    return False


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


class TrackerMemberOut(BaseModel):
    userId: str
    email: str
    displayName: str | None = None
    deadlineBefore: str | None = Field(
        None,
        description="Tracker must be sent on a weekday strictly before this day (UTC week, e.g. thu => by Wed).",
    )
    metThisWeek: bool | None = Field(
        None,
        description="Whether the member met the deadline this UTC week; null if no per-member deadline.",
    )
    scheduleDaysOverride: list[str] | None = Field(
        None,
        description="Expected tracker weekdays for this member; null = use project tracker days, [] = none expected.",
    )


class ProjectTrackerOut(BaseModel):
    projectId: str
    projectName: str
    teamName: str | None = None
    scheduleDays: list[str] = Field(default_factory=list)
    weekStartISO: str
    weekEndISO: str
    days: list[TrackerDayState]
    members: list[TrackerMemberOut] = Field(default_factory=list)


class TrackerDashboardOut(BaseModel):
    projects: list[ProjectTrackerOut]


class TrackerSchedulePatch(BaseModel):
    scheduleDays: list[str] = Field(
        default_factory=list,
        description="Weekday keys: mon,tue,wed,thu,fri,sat,sun (lowercase)",
    )
    memberDeadlineBeforeDays: dict[str, str | None] | None = Field(
        None,
        description="Per assignee userId -> deadline weekday before which to send, or null to remove.",
    )
    memberScheduleDays: dict[str, list[str] | None] | None = Field(
        None,
        description="Per assignee userId -> expected weekday list, or null to remove override (use project days).",
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


def _build_project_tracker_out(
    db: Session,
    p: TeamProject,
    week_start: datetime,
    week_end: datetime,
    watch_emails: set[str],
) -> ProjectTrackerOut:
    schedule = _normalize_schedule_days(getattr(p, "tracker_schedule_days", None))
    rows_week = _qualifying_tracker_rows_project_week(db, p, week_start, week_end, watch_emails)
    sent_dows: set[int] = set()
    for ra, _ in rows_week:
        iw = _utc_isoweekday(ra)
        if 1 <= iw <= 7:
            sent_dows.add(iw)
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
    deadline_map = _normalize_member_deadline_map(getattr(p, "tracker_member_deadline_days", None))
    raw_member_sched = getattr(p, "tracker_member_schedule_days", None)
    members_out: list[TrackerMemberOut] = []
    assignments = list(getattr(p, "assignments", None) or [])
    assignments.sort(key=lambda a: ((a.user.email or "").lower() if getattr(a, "user", None) else ""))
    for a in assignments:
        u = a.user
        if not u:
            continue
        uid = str(u.id)
        em = (u.email or "").strip()
        dk = deadline_map.get(uid)
        met: bool | None = None
        if dk:
            met = _member_met_deadline(rows_week, em.lower(), dk)
        sched_override = _member_schedule_override_for_out(raw_member_sched, uid)
        members_out.append(
            TrackerMemberOut(
                userId=uid,
                email=em,
                displayName=u.display_name,
                deadlineBefore=dk,
                metThisWeek=met,
                scheduleDaysOverride=sched_override,
            )
        )
    return ProjectTrackerOut(
        projectId=p.id,
        projectName=p.name,
        teamName=team_name,
        scheduleDays=schedule,
        weekStartISO=week_start.isoformat().replace("+00:00", "Z"),
        weekEndISO=week_end.isoformat().replace("+00:00", "Z"),
        days=days,
        members=members_out,
    )


def _tracker_projects_for_dashboard(db: Session, actor_email: str) -> list[TeamProject]:
    q = (
        db.query(TeamProject)
        .options(
            joinedload(TeamProject.team),
            joinedload(TeamProject.assignments).joinedload(ProjectAssignment.user),
        )
        .filter(not_(func.lower(TeamProject.status).in_(_TRACKER_DASHBOARD_EXCLUDED_STATUSES)))
        .order_by(TeamProject.updated_at.desc())
    )
    if actor_manager_scope_mailboxes(db, actor_email) is not None:
        mgr = manager_actor_row(db, actor_email)
        if not mgr or not mgr.team_id:
            return []
        q = q.filter(TeamProject.team_id == mgr.team_id)
    return q.all()


def _assert_tracker_project_access(db: Session, actor_email: str, project: TeamProject) -> None:
    if actor_manager_scope_mailboxes(db, actor_email) is None:
        return
    mgr = manager_actor_row(db, actor_email)
    if not mgr or not mgr.team_id or project.team_id != mgr.team_id:
        raise HTTPException(
            status_code=403,
            detail="You can only access tracker data for your department's projects",
        )


@router.get("", response_model=TrackerDashboardOut)
def get_tracker_dashboard(
    db: Session = Depends(get_db),
    actor_email: str = Depends(get_current_user_email),
):
    week_start, week_end = _week_bounds_utc()
    watch_emails = _tracker_watch_emails(db)
    projects = _tracker_projects_for_dashboard(db, actor_email)
    out = [_build_project_tracker_out(db, p, week_start, week_end, watch_emails) for p in projects]
    return TrackerDashboardOut(projects=out)


@router.get("/{project_id}/emails", response_model=TrackerEmailsOut)
def list_project_tracker_emails(
    project_id: str,
    days: int = Query(7, ge=1, le=365, description="Lookback window ending now (UTC), in days"),
    limit: int = Query(100, ge=1, le=300, description="Max rows after Cc filter"),
    db: Session = Depends(get_db),
    actor_email: str = Depends(get_current_user_email),
):
    """Matching tracker mails for this project in the lookback window (newest first)."""
    p = db.query(TeamProject).filter(TeamProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_tracker_project_access(db, actor_email, p)
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
    actor_email: str = Depends(get_current_user_email),
):
    p = (
        db.query(TeamProject)
        .options(
            joinedload(TeamProject.team),
            joinedload(TeamProject.assignments).joinedload(ProjectAssignment.user),
        )
        .filter(TeamProject.id == project_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    _assert_tracker_project_access(db, actor_email, p)
    schedule = _normalize_schedule_days(body.scheduleDays)
    p.tracker_schedule_days = schedule if schedule else None

    if body.memberDeadlineBeforeDays is not None:
        assignee_ids = {str(a.user_id) for a in (p.assignments or [])}
        merged = dict(_normalize_member_deadline_map(getattr(p, "tracker_member_deadline_days", None)))
        for uid_raw, val in body.memberDeadlineBeforeDays.items():
            uids = str(uid_raw).strip()
            if not uids:
                continue
            if uids not in assignee_ids:
                raise HTTPException(
                    status_code=400,
                    detail="User is not assigned to this project",
                )
            if val is None or (isinstance(val, str) and not str(val).strip()):
                merged.pop(uids, None)
            else:
                k = str(val).strip().lower()
                if k not in TRACKER_DAY_KEYS:
                    raise HTTPException(status_code=400, detail="Invalid deadline weekday")
                merged[uids] = k
        p.tracker_member_deadline_days = merged if merged else None

    if body.memberScheduleDays is not None:
        assignee_ids = {str(a.user_id) for a in (p.assignments or [])}
        prev = getattr(p, "tracker_member_schedule_days", None)
        merged_sched: dict[str, list[str]] = {}
        if isinstance(prev, dict):
            for k, v in prev.items():
                ks = str(k).strip() if k is not None else ""
                if ks in assignee_ids and isinstance(v, list):
                    merged_sched[ks] = _normalize_schedule_days(v)
        for uid_raw, val in body.memberScheduleDays.items():
            uids = str(uid_raw).strip()
            if not uids:
                continue
            if uids not in assignee_ids:
                raise HTTPException(
                    status_code=400,
                    detail="User is not assigned to this project",
                )
            if val is None:
                merged_sched.pop(uids, None)
            elif isinstance(val, list):
                merged_sched[uids] = _normalize_schedule_days(val)
            else:
                raise HTTPException(status_code=400, detail="Invalid member schedule days")
        p.tracker_member_schedule_days = merged_sched if merged_sched else None

    db.add(p)
    db.commit()

    week_start, week_end = _week_bounds_utc()
    watch_emails = _tracker_watch_emails(db)
    p2 = (
        db.query(TeamProject)
        .options(
            joinedload(TeamProject.team),
            joinedload(TeamProject.assignments).joinedload(ProjectAssignment.user),
        )
        .filter(TeamProject.id == project_id)
        .first()
    )
    if not p2:
        raise HTTPException(status_code=404, detail="Project not found")
    return _build_project_tracker_out(db, p2, week_start, week_end, watch_emails)
