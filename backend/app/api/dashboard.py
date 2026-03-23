from datetime import datetime, timezone, timedelta
from urllib.parse import quote
import re
import httpx
from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from app.db.session import get_db
from app.db.models import Email, DailySummary
from app.workers.tasks import get_queue_stats, generate_daily_summary_task
from app.api.deps import get_current_user_email
from app.graph.auth import get_auth_headers

router = APIRouter()


_CALENDAR_SELECT_ORDER = (
    "&$select=id,subject,start,end,organizer,onlineMeeting,isCancelled,location,webLink,isOnlineMeeting,showAs"
    "&$orderby=start/dateTime"
    "&$top=50"
)


def _graph_http_error_message(r: httpx.Response) -> str:
    """Best-effort parse of Graph JSON error for troubleshooting."""
    try:
        body = r.json()
        err = body.get("error") or {}
        code = err.get("code") or ""
        msg = err.get("message") or r.text or ""
        inner = err.get("innerError") or {}
        inner_msg = inner.get("message") or ""
        parts = [p for p in (code, msg, inner_msg) if p]
        return " | ".join(parts) if parts else (r.text or str(r.status_code))
    except Exception:
        return r.text or str(r.status_code)


def _events_from_graph_payload(data: dict) -> list[dict]:
    raw = data.get("value") or []
    out: list[dict] = []
    for ev in raw:
        org = ev.get("organizer") or {}
        org_email_obj = (org.get("emailAddress") or {})
        loc = ev.get("location") or {}
        loc_disp = (loc.get("displayName") or "").strip()
        om = ev.get("onlineMeeting") or {}
        join_url = (om.get("joinUrl") or "").strip() or None
        out.append(
            {
                "id": ev.get("id"),
                "subject": (ev.get("subject") or "(No subject)").strip(),
                "start": ev.get("start"),
                "end": ev.get("end"),
                "organizerName": (org_email_obj.get("name") or "").strip() or None,
                "organizerEmail": (org_email_obj.get("address") or "").strip() or None,
                "joinUrl": join_url,
                "webLink": (ev.get("webLink") or "").strip() or None,
                "isCancelled": bool(ev.get("isCancelled", False)),
                "isOnlineMeeting": bool(ev.get("isOnlineMeeting", False)),
                "location": loc_disp or None,
                "showAs": ev.get("showAs"),
            }
        )
    return out


def _calendar_view_url(user_path: str, start_s: str, end_s: str) -> str:
    """user_path: 'me' or 'users/{url-encoded-upn}'."""
    return (
        f"https://graph.microsoft.com/v1.0/{user_path}/calendarView"
        f"?startDateTime={quote(start_s)}&endDateTime={quote(end_s)}"
        f"{_CALENDAR_SELECT_ORDER}"
    )


def _verify_delegated_user_matches(bearer_token: str, expected_lower: str) -> str | None:
    """Ensure Graph /me identity matches X-User-Email. Returns error string or None."""
    url = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"
    headers = {"Authorization": f"Bearer {bearer_token}"}
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(url, headers=headers)
    except Exception as e:
        return f"Could not verify sign-in token: {e!s}"
    if r.status_code != 200:
        return (
            "Sign-in token not accepted by Microsoft Graph for /me. "
            "Re-sign in and ensure NextAuth requests delegated User.Read + Calendars.Read. "
            f"Graph: {_graph_http_error_message(r)}"
        )
    try:
        data = r.json()
    except Exception:
        return "Invalid /me response from Graph."
    mail = (data.get("mail") or "").strip().lower()
    upn = (data.get("userPrincipalName") or "").strip().lower()
    if expected_lower != mail and expected_lower != upn:
        return "Calendar token belongs to a different Microsoft account than X-User-Email."
    return None


def _graph_calendar_events_delegated(
    bearer_token: str,
    start_utc: datetime,
    end_utc: datetime,
) -> tuple[list[dict], str | None]:
    """Signed-in user's calendar via delegated token (/me/calendarView)."""
    start_s = start_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_s = end_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    url = _calendar_view_url("me", start_s, end_s)
    headers = {"Authorization": f"Bearer {bearer_token}"}
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(url, headers=headers)
    except Exception as e:
        return [], f"Graph request failed: {e!s}"
    if r.status_code != 200:
        return [], _graph_http_error_message(r)
    try:
        data = r.json()
    except Exception:
        return [], "Invalid Graph response"
    return _events_from_graph_payload(data), None


def _graph_calendar_events(
    user_principal: str,
    start_utc: datetime,
    end_utc: datetime,
) -> tuple[list[dict], str | None]:
    """
    Fetch calendar view via Microsoft Graph (application permissions).
    Requires Application permission: Calendars.Read or Calendars.ReadWrite (admin consent).
    Often blocked by tenant 'ErrorAccessDenied' — prefer delegated flow via Authorization header.
    """
    user_principal = (user_principal or "").strip()
    if not user_principal or "@" not in user_principal:
        return [], "Invalid user mailbox"

    start_s = start_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_s = end_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    user_seg = quote(user_principal, safe="")
    url = _calendar_view_url(f"users/{user_seg}", start_s, end_s)
    headers = get_auth_headers()
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(url, headers=headers)
    except Exception as e:
        return [], f"Graph request failed: {e!s}"

    if r.status_code == 403:
        graph_detail = _graph_http_error_message(r)
        return [], (
            f"Calendar access denied (403) for app-only access. Microsoft Graph: {graph_detail}. "
            "Many tenants block this. Fix A — use sign-in token: add delegated Calendars.Read to your SPA app, "
            "re-sign in, and the dashboard will call Graph as the signed-in user. "
            "Fix B — Application permission Calendars.Read on the backend app + admin consent, "
            "and ensure Exchange application access policies allow this app."
        )
    if r.status_code == 404:
        return [], "User mailbox not found in tenant (check sign-in email matches Azure UPN)."
    if r.status_code != 200:
        return [], _graph_http_error_message(r)

    try:
        data = r.json()
    except Exception:
        return [], "Invalid Graph response"

    return _events_from_graph_payload(data), None


def _parse_bearer(authorization: str | None) -> str | None:
    if not authorization or not isinstance(authorization, str):
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return parts[1].strip()


# --- Calendar from synced mail (meeting invites) — no Graph Calendars.Read ---
_RESUME_SUBJECT_MARKERS = (
    "resume",
    "curriculum vitae",
    "cv attached",
    "job application",
    "applying for",
    "please find my cv",
    "please find attached resume",
)


def _subject_looks_like_resume_noise(subject: str | None) -> bool:
    s = (subject or "").lower()
    return any(m in s for m in _RESUME_SUBJECT_MARKERS)


def _email_looks_like_meeting_invite(email: Email) -> bool:
    """Heuristic: Graph meetingMessageType and/or invite patterns in subject/body."""
    if _subject_looks_like_resume_noise(email.subject):
        return False
    rp = email.raw_payload if isinstance(email.raw_payload, dict) else {}
    mt = str(rp.get("meetingMessageType") or "").lower()
    if mt and mt not in ("none", "notamessage"):
        return True
    subj = (email.subject or "").lower()
    preview = (email.body_preview or "").lower()
    if any(
        x in subj
        for x in (
            "meeting",
            "invitation:",
            " invite:",
            "teams meeting",
            "zoom meeting",
            "google meet",
            "calendar:",
        )
    ):
        return True
    if any(
        x in preview
        for x in (
            "teams.microsoft.com",
            "zoom.us",
            "meet.google.com",
            "webex.com",
            "when:",
            "start time",
            "join the meeting",
        )
    ):
        return True
    return False


_ISO_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?"
)


def _parse_iso_datetimes(text: str) -> list[datetime]:
    out: list[datetime] = []
    if not text:
        return out
    for m in _ISO_RE.finditer(text):
        s = m.group(0)
        try:
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            out.append(dt.astimezone(timezone.utc))
        except Exception:
            continue
    return out


def _extract_online_meeting_url(text: str) -> str | None:
    if not text:
        return None
    for pattern in (
        r"https://teams\.microsoft\.com/l/meetup-join/[^\s\"<>]+",
        r"https://teams\.live\.com/meet/[^\s\"<>]+",
        r"https://[\w.-]*zoom\.us/j/[^\s\"<>]+",
        r"https://meet\.google\.com/[^\s\"<>]+",
    ):
        m = re.search(pattern, text, re.I)
        if m:
            return m.group(0).rstrip(").,;")
    return None


def _email_to_calendar_event_dict(email: Email) -> dict:
    rp = email.raw_payload if isinstance(email.raw_payload, dict) else {}
    mt = str(rp.get("meetingMessageType") or "").lower()
    is_cancelled = mt == "meetingcancelled"
    text_blob = f"{email.subject or ''}\n{email.body_preview or ''}"
    times = _parse_iso_datetimes(text_blob)
    start_dt: datetime | None = times[0] if times else None
    end_dt: datetime | None = times[1] if len(times) > 1 else None
    if start_dt is None:
        ra = email.received_at
        if ra is not None:
            if ra.tzinfo is None:
                ra = ra.replace(tzinfo=timezone.utc)
            start_dt = ra.astimezone(timezone.utc)
        else:
            start_dt = datetime.now(timezone.utc)
    if end_dt is None:
        end_dt = start_dt + timedelta(hours=1)

    def _fmt(dt: datetime) -> dict:
        u = dt.astimezone(timezone.utc)
        return {"dateTime": u.strftime("%Y-%m-%dT%H:%M:%S.000Z"), "timeZone": "UTC"}

    org_name = (email.sender_display_name or "").strip() or None
    org_email = (email.sender_email or "").strip() or None
    join_url = _extract_online_meeting_url(text_blob)
    return {
        "id": email.id,
        "subject": (email.subject or "(Meeting mail)").strip(),
        "start": _fmt(start_dt),
        "end": _fmt(end_dt),
        "organizerName": org_name,
        "organizerEmail": org_email,
        "joinUrl": join_url,
        "webLink": None,
        "isCancelled": is_cancelled,
        "isOnlineMeeting": bool(join_url),
        "location": None,
        "showAs": None,
    }


def _calendar_events_from_synced_mail(
    db: Session,
    mailbox: str,
    window_start: datetime,
    window_end: datetime,
) -> tuple[list[dict], str | None]:
    """
    Build calendar-style rows from meeting-related messages already ingested via Graph Mail (same
    Mail.Read / sync pipeline as the rest of the app). No Calendars.Read.
    """
    try:
        lookback = datetime.now(timezone.utc) - timedelta(days=120)
        rows = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email == mailbox,
                Email.received_at >= lookback,
            )
            .order_by(Email.received_at.desc())
            .limit(1200)
            .all()
        )
    except (OperationalError, Exception) as e:
        return [], f"Could not load mail for meetings: {e!s}"

    events: list[dict] = []
    for em in rows:
        if not _email_looks_like_meeting_invite(em):
            continue
        ev = _email_to_calendar_event_dict(em)
        # Parse start for window filter
        try:
            sd = (ev.get("start") or {}).get("dateTime") or ""
            start_check = datetime.fromisoformat(sd.replace("Z", "+00:00"))
        except Exception:
            start_check = em.received_at or datetime.now(timezone.utc)
        if start_check.tzinfo is None:
            start_check = start_check.replace(tzinfo=timezone.utc)
        if start_check < window_start or start_check > window_end:
            continue
        events.append(ev)

    events.sort(key=lambda x: (x.get("start") or {}).get("dateTime") or "")
    return events, None


@router.get("/metrics")
def dashboard_metrics(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    period: str | None = Query(None, description="Filter by period: daily, weekly, monthly, yearly. Omit for all-time."),
):
    now_utc = datetime.now(timezone.utc)
    try:
        today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        base = db.query(Email).filter(Email.mailbox_owner_email == current_user_email)
        emails_today = base.filter(Email.received_at >= today_start).count()
    except (OperationalError, Exception):
        emails_today = 0
    queue_stats = get_queue_stats()

    total_emails = 0
    total_classified = 0
    category_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}

    since = None
    if period and period.strip().lower() in ("daily", "weekly", "monthly", "yearly"):
        p = period.strip().lower()
        if p == "daily":
            since = now_utc - timedelta(days=1)
        elif p == "weekly":
            since = now_utc - timedelta(days=7)
        elif p == "monthly":
            since = now_utc - timedelta(days=30)
        else:
            since = now_utc - timedelta(days=365)

    try:
        base = db.query(Email).filter(Email.mailbox_owner_email == current_user_email)
        if since is not None:
            base = base.filter(Email.received_at >= since)
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


@router.get("/daily-summary")
def get_daily_summary(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    date: str | None = Query(None, description="YYYY-MM-DD; default: latest for user's mailbox"),
):
    """Return end-of-day summary for the given date. Per-mailbox; user sees their own mailbox summary."""
    try:
        if date:
            try:
                day_start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                return {"summaries": [], "date": date, "error": "Invalid date format (use YYYY-MM-DD)"}
            rows = (
                db.query(DailySummary)
                .filter(
                    DailySummary.summary_date == day_start,
                    DailySummary.mailbox_owner_email == current_user_email,
                )
                .all()
            )
        else:
            row = (
                db.query(DailySummary)
                .filter(DailySummary.mailbox_owner_email == current_user_email)
                .order_by(DailySummary.summary_date.desc())
                .first()
            )
            rows = [row] if row else []
        summaries = [{"date": r.summary_date.strftime("%Y-%m-%d"), **r.summary} for r in rows]
        return {"summaries": summaries, "date": date}
    except (OperationalError, Exception):
        return {"summaries": [], "date": date}


@router.post("/daily-summary/generate")
def trigger_daily_summary(
    current_user_email: str = Depends(get_current_user_email),
    date: str | None = Query(None, description="YYYY-MM-DD; default: yesterday"),
):
    """Enqueue end-of-day summary generation for the given date (for testing or manual run)."""
    generate_daily_summary_task.delay(date)
    return {"ok": True, "message": "Daily summary task enqueued", "date": date}


@router.get("/calendar-events")
def dashboard_calendar_events(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    days: int = Query(14, ge=1, le=90, description="Days ahead from now to include (plus 1 day back for ongoing)"),
    source: str = Query(
        "mail",
        description="mail = meeting invites from synced Mail (no Calendars.Read). graph = legacy Graph calendarView.",
    ),
    authorization: str | None = Header(None, alias="Authorization"),
):
    """
    Dashboard “calendar” rows.

    **Default `source=mail`:** meeting-related messages already ingested for this mailbox (Graph **Mail** sync).
    Uses `meetingMessageType` and heuristics; excludes obvious resume/CV subjects. No Graph calendar API.

    **`source=graph`:** optional legacy path — Graph `calendarView` (needs Calendars.Read app or delegated Bearer).
    """
    now_utc = datetime.now(timezone.utc)
    start_utc = now_utc - timedelta(days=1)
    end_utc = now_utc + timedelta(days=days)
    mailbox = (current_user_email or "").strip().lower()

    if (source or "mail").strip().lower() == "graph":
        bearer = _parse_bearer(authorization)
        if bearer:
            v = _verify_delegated_user_matches(bearer, mailbox)
            if v:
                return {"events": [], "error": v}
            events, err = _graph_calendar_events_delegated(bearer, start_utc, end_utc)
            return {"events": events, "error": err}
        events, err = _graph_calendar_events(mailbox, start_utc, end_utc)
        return {"events": events, "error": err}

    events, err = _calendar_events_from_synced_mail(db, mailbox, start_utc, end_utc)
    return {"events": events, "error": err}
