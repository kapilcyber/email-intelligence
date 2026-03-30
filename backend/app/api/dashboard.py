from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.parse import quote
import re
import httpx
from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from sqlalchemy.exc import OperationalError
from app.db.session import get_db
from app.db.models import Email, DailySummary, User, TeamProject, ProjectAssignment, Team
from app.workers.tasks import get_queue_stats_for_user, generate_daily_summary_task
from app.api.deps import get_current_user_email
from app.graph.auth import get_auth_headers
from app.http_client import httpx_client

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
        with httpx_client(timeout=15.0) as client:
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
        with httpx_client(timeout=30.0) as client:
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
        with httpx_client(timeout=30.0) as client:
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
    odata_type = str(rp.get("@odata.type") or "").lower()
    if "eventmessage" in odata_type:
        return True
    mt = str(rp.get("meetingMessageType") or "").lower()
    if mt and mt not in ("none", "notamessage"):
        return True
    subj = (email.subject or "").lower()
    preview = (email.body_preview or "").lower()
    if any(
        x in subj
        for x in (
            "meeting",
            "invitation",
            "invitation:",
            "meeting request",
            "webinar",
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
_HUMAN_DATE_RE = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+"
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"(?:\s*,?\s*(\d{4}))?\b",
    re.I,
)
_HUMAN_TIME_RE = re.compile(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?\b", re.I)
_MONTHS = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


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


def _parse_human_datetime(text: str, fallback_year: int) -> datetime | None:
    if not text:
        return None
    dm = _HUMAN_DATE_RE.search(text)
    if not dm:
        return None
    day = int(dm.group(1))
    mon_s = (dm.group(2) or "").lower()
    month = _MONTHS.get(mon_s)
    if not month:
        return None
    year = int(dm.group(3)) if dm.group(3) else fallback_year
    hour = 9
    minute = 0
    tm = _HUMAN_TIME_RE.search(text)
    if tm:
        hour = int(tm.group(1))
        minute = int(tm.group(2))
        ap = (tm.group(3) or "").lower()
        if ap == "pm" and hour < 12:
            hour += 12
        elif ap == "am" and hour == 12:
            hour = 0
    try:
        return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    except ValueError:
        return None


# Graph Windows → IANA (subset) for meeting startDateTime / endDateTime timeZone
_GRAPH_WINDOWS_TZ_TO_IANA: dict[str, str] = {
    "utc": "UTC",
    "tijuana": "America/Tijuana",
    "pacific standard time": "America/Los_Angeles",
    "mountain standard time": "America/Denver",
    "central standard time": "America/Chicago",
    "eastern standard time": "America/New_York",
    "gmt standard time": "Europe/London",
    "w. europe standard time": "Europe/Berlin",
    "central europe standard time": "Europe/Warsaw",
    "india standard time": "Asia/Kolkata",
    "singapore standard time": "Asia/Singapore",
    "tokyo standard time": "Asia/Tokyo",
    "australia eastern standard time": "Australia/Sydney",
}


def _parse_graph_date_time_time_zone(obj: Any) -> datetime | None:
    """Parse Graph dateTimeTimeZone to UTC-aware datetime."""
    if not isinstance(obj, dict):
        return None
    ds = obj.get("dateTime")
    if not ds or not isinstance(ds, str):
        return None
    ds = ds.strip()
    if not ds:
        return None
    tz_key = (obj.get("timeZone") or "UTC").strip() or "UTC"
    if ds.endswith("Z"):
        ds = ds[:-1] + "+00:00"
    # Graph may send 7-digit fractional seconds; fromisoformat needs ≤6 in practice
    ds = re.sub(r"(\.\d{6})\d+", r"\1", ds)
    try:
        dt = datetime.fromisoformat(ds)
    except ValueError:
        try:
            dt = datetime.fromisoformat(ds[:19])
        except ValueError:
            return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc)
    tz_l = tz_key.lower()
    if tz_l in ("utc", "gmt", "greenwich mean time"):
        return dt.replace(tzinfo=timezone.utc)
    iana = _GRAPH_WINDOWS_TZ_TO_IANA.get(tz_l)
    if not iana and "/" in tz_key:
        iana = tz_key  # already IANA
    if iana:
        try:
            from zoneinfo import ZoneInfo

            return dt.replace(tzinfo=ZoneInfo(iana)).astimezone(timezone.utc)
        except Exception:
            pass
    return dt.replace(tzinfo=timezone.utc)


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

    start_dt = _parse_graph_date_time_time_zone(rp.get("startDateTime"))
    end_dt = _parse_graph_date_time_time_zone(rp.get("endDateTime"))
    if start_dt is None or end_dt is None:
        times = _parse_iso_datetimes(text_blob)
        if start_dt is None:
            start_dt = times[0] if times else None
        if end_dt is None:
            end_dt = times[1] if len(times) > 1 else None
    if start_dt is None:
        fallback_year = (email.received_at.year if email.received_at else datetime.now(timezone.utc).year)
        start_dt = _parse_human_datetime(text_blob, fallback_year)
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
    org_block = rp.get("organizer") if isinstance(rp.get("organizer"), dict) else {}
    org_ea = (org_block.get("emailAddress") or {}) if isinstance(org_block, dict) else {}
    if isinstance(org_ea, dict):
        if not org_name and org_ea.get("name"):
            org_name = str(org_ea.get("name")).strip() or org_name
        if not org_email and org_ea.get("address"):
            org_email = str(org_ea.get("address")).strip() or org_email

    join_url = _extract_online_meeting_url(text_blob)
    om = rp.get("onlineMeeting") if isinstance(rp.get("onlineMeeting"), dict) else {}
    if not join_url and isinstance(om, dict):
        ju = (om.get("joinUrl") or "").strip()
        if ju:
            join_url = ju

    loc_disp = ""
    loc = rp.get("location")
    if isinstance(loc, dict):
        loc_disp = (loc.get("displayName") or "").strip()

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
        "location": loc_disp or None,
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
        mbox = (mailbox or "").strip().lower()
        rows = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email.isnot(None),
                func.lower(Email.mailbox_owner_email) == mbox,
                Email.received_at >= lookback,
            )
            .order_by(Email.received_at.desc())
            .limit(2000)
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
        base = db.query(Email).filter(
            Email.mailbox_owner_email.isnot(None),
            func.lower(Email.mailbox_owner_email) == current_user_email,
        )
        emails_today = base.filter(Email.received_at >= today_start).count()
    except (OperationalError, Exception):
        emails_today = 0
    queue_stats = get_queue_stats_for_user(current_user_email)

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
        base = db.query(Email).filter(
            Email.mailbox_owner_email.isnot(None),
            func.lower(Email.mailbox_owner_email) == current_user_email,
        )
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
                    DailySummary.mailbox_owner_email.isnot(None),
                    func.lower(DailySummary.mailbox_owner_email) == current_user_email,
                )
                .all()
            )
        else:
            row = (
                db.query(DailySummary)
                .filter(
                    DailySummary.mailbox_owner_email.isnot(None),
                    func.lower(DailySummary.mailbox_owner_email) == current_user_email,
                )
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


@router.get("/notifications")
def dashboard_notifications(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """
    Bell notifications for current mailbox only (user/admin sees own mailbox).
    Includes: new mail, meeting scheduled, AI pending/failed, unreplied mails, important upcoming dates.
    """
    now_utc = datetime.now(timezone.utc)
    mailbox = (current_user_email or "").strip().lower()

    try:
        recent_rows = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email.isnot(None),
                func.lower(Email.mailbox_owner_email) == mailbox,
                Email.received_at >= now_utc - timedelta(days=14),
            )
            .order_by(Email.received_at.desc())
            .limit(1500)
            .all()
        )
    except (OperationalError, Exception) as e:
        return {"items": [], "error": f"Could not load notifications: {e!s}"}

    items: list[dict] = []

    # 1) New mail in last 6 hours
    new_rows = [r for r in recent_rows if r.received_at and r.received_at >= now_utc - timedelta(hours=6)]
    if new_rows:
        items.append(
            {
                "id": "new-mail",
                "kind": "new_mail",
                "title": f"{len(new_rows)} new mail(s)",
                "message": "New emails arrived in your mailbox.",
                "level": "info",
                "at": max(r.received_at for r in new_rows).isoformat(),
                "count": len(new_rows),
                "href": "/emails",
            }
        )

    # 2) AI pending/failed in last 24h
    pending_rows = [
        r
        for r in recent_rows
        if (getattr(r, "ai_status", None) in ("pending", "failed")) and r.received_at and r.received_at >= now_utc - timedelta(days=1)
    ]
    if pending_rows:
        items.append(
            {
                "id": "ai-pending",
                "kind": "ai_pending",
                "title": f"{len(pending_rows)} mail(s) not classified",
                "message": "Some emails are pending/failed AI classification.",
                "level": "warning",
                "at": max(r.received_at for r in pending_rows).isoformat(),
                "count": len(pending_rows),
                "href": "/emails",
            }
        )

    # 3) Meeting schedules in next 14 days
    meetings, _ = _calendar_events_from_synced_mail(db, mailbox, now_utc - timedelta(days=1), now_utc + timedelta(days=14))
    upcoming_meetings = []
    for ev in meetings:
        try:
            s = (ev.get("start") or {}).get("dateTime") or ""
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt >= now_utc:
                upcoming_meetings.append((dt, ev))
        except Exception:
            continue
    upcoming_meetings.sort(key=lambda x: x[0])
    if upcoming_meetings:
        dt, ev = upcoming_meetings[0]
        items.append(
            {
                "id": "meeting-next",
                "kind": "meeting_scheduled",
                "title": "Meeting scheduled",
                "message": f"{ev.get('subject') or 'Meeting'} on {dt.strftime('%d %b %Y %H:%M UTC')}",
                "level": "info",
                "at": dt.isoformat(),
                "count": len(upcoming_meetings),
                "href": "/dashboard",
            }
        )

    # 4) Important upcoming dates (meeting dates in next 30 days, grouped by day)
    important_days: dict[str, int] = {}
    for dt, _ev in upcoming_meetings:
        if dt > now_utc + timedelta(days=30):
            continue
        k = dt.strftime("%Y-%m-%d")
        important_days[k] = (important_days.get(k) or 0) + 1
    if important_days:
        next_day = sorted(important_days.keys())[0]
        items.append(
            {
                "id": "important-dates",
                "kind": "important_date",
                "title": "Important date from mail",
                "message": f"{important_days[next_day]} item(s) on {next_day}",
                "level": "info",
                "at": f"{next_day}T00:00:00+00:00",
                "count": sum(important_days.values()),
                "href": "/dashboard",
            }
        )

    # 5) Unreplied inbox mails (>24h old) by conversation
    sent_cids = set()
    for r in recent_rows:
        folder = (getattr(r, "folder_name", None) or getattr(r, "folder_id", None) or "").lower()
        if "sent" in folder and (r.conversation_id or "").strip():
            sent_cids.add((r.conversation_id or "").strip())
    unreplied = []
    for r in recent_rows:
        folder = (getattr(r, "folder_name", None) or getattr(r, "folder_id", None) or "").lower()
        cid = (r.conversation_id or "").strip()
        if "inbox" not in folder:
            continue
        if not r.received_at or r.received_at > now_utc - timedelta(hours=24):
            continue
        if cid and cid in sent_cids:
            continue
        unreplied.append(r)
    if unreplied:
        items.append(
            {
                "id": "unreplied",
                "kind": "unreplied_mail",
                "title": f"{len(unreplied)} mail(s) awaiting reply",
                "message": "Inbox mails older than 24h without a sent reply in thread.",
                "level": "warning",
                "at": max(r.received_at for r in unreplied).isoformat(),
                "count": len(unreplied),
                "href": "/threads",
            }
        )

    items.sort(key=lambda x: x.get("at", ""), reverse=True)
    return {"items": items[:15], "error": None}


@router.get("/my-projects")
def dashboard_my_projects(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Projects assigned to the current user (for user dashboard project visibility)."""
    email = (current_user_email or "").strip().lower()
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            return {"projects": []}

        rows = (
            db.query(ProjectAssignment, TeamProject, Team)
            .join(TeamProject, TeamProject.id == ProjectAssignment.project_id)
            .outerjoin(Team, Team.id == TeamProject.team_id)
            .filter(ProjectAssignment.user_id == user.id)
            .order_by(TeamProject.updated_at.desc())
            .all()
        )
        projects: list[dict] = []
        for a, p, t in rows:
            projects.append(
                {
                    "projectId": p.id,
                    "projectName": p.name,
                    "status": p.status,
                    "teamName": (t.name if t else None),
                    "role": a.role,
                    "responsibilities": a.responsibilities,
                    "reportsToUserId": a.reports_to_user_id,
                    "structure": p.structure if isinstance(p.structure, dict) else None,
                    "updatedAt": (p.updated_at.isoformat() if p.updated_at else None),
                }
            )
        return {"projects": projects}
    except (OperationalError, Exception):
        return {"projects": []}


# --- Follow UP (user): own tracker sends vs admin-set expected weekdays ---

_FU_TRACKER_SUB = "tracker"
_FU_DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_FU_DAY_LABELS = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}
_FU_ISO_TO_KEY = {1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 7: "sun"}


def _fu_week_bounds_utc(now: datetime | None = None) -> tuple[datetime, datetime]:
    n = now or datetime.now(timezone.utc)
    if n.tzinfo is None:
        n = n.replace(tzinfo=timezone.utc)
    else:
        n = n.astimezone(timezone.utc)
    monday = (n - timedelta(days=n.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday_end = monday + timedelta(days=7) - timedelta(microseconds=1)
    return monday, sunday_end


def _fu_utc_day_bounds(d) -> tuple[datetime, datetime]:
    start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1) - timedelta(microseconds=1)
    return start, end


def _fu_normalize_schedule_days(raw) -> list[str]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[str] = []
    for x in raw:
        if not isinstance(x, str):
            continue
        k = x.strip().lower()
        if k in _FU_DAY_KEYS and k not in out:
            out.append(k)
    return out


def _fu_like_pat(name: str) -> str:
    s = (name or "").strip()
    if not s:
        return ""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _fu_user_tracker_rows_week(
    db: Session,
    user_email_lower: str,
    week_start: datetime,
    week_end: datetime,
):
    return (
        db.query(Email.received_at, Email.subject)
        .filter(
            and_(
                func.lower(Email.sender_email) == user_email_lower,
                Email.received_at >= week_start,
                Email.received_at <= week_end,
                Email.subject.isnot(None),
                func.lower(Email.subject).like(f"%{_FU_TRACKER_SUB}%", escape="\\"),
            )
        )
        .all()
    )


def _fu_sent_dates_by_project(
    projects: list[TeamProject],
    rows: list,
) -> dict[str, set]:
    """Map project_id -> set of UTC dates user sent a matching tracker."""
    out: dict[str, set] = {p.id: set() for p in projects}
    pnames = [(p.id, (p.name or "").strip().lower()) for p in projects if (p.name or "").strip()]
    for received_at, subject in rows:
        if not received_at:
            continue
        dt = received_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        d = dt.date()
        sl = (subject or "").lower()
        for pid, pn in pnames:
            if pn and pn in sl:
                out.setdefault(pid, set()).add(d)
    return out


@router.get("/follow-up/tracker")
def dashboard_follow_up_tracker(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Per assigned project: expected tracker weekdays (admin) vs whether this user sent (From = user)."""
    email = (current_user_email or "").strip().lower()
    week_start, week_end = _fu_week_bounds_utc()
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            return {
                "weekStartISO": week_start.isoformat().replace("+00:00", "Z"),
                "weekEndISO": week_end.isoformat().replace("+00:00", "Z"),
                "projects": [],
            }

        rows = (
            db.query(ProjectAssignment, TeamProject, Team)
            .join(TeamProject, TeamProject.id == ProjectAssignment.project_id)
            .outerjoin(Team, Team.id == TeamProject.team_id)
            .filter(ProjectAssignment.user_id == user.id)
            .order_by(TeamProject.updated_at.desc())
            .all()
        )
        projects: list[TeamProject] = [p for _, p, _ in rows]
        teams = {p.id: t for _, p, t in rows}

        tracker_rows = _fu_user_tracker_rows_week(db, email, week_start, week_end)
        sent_by_proj = _fu_sent_dates_by_project(projects, tracker_rows)

        out_projects: list[dict] = []
        for _, p, _ in rows:
            schedule = _fu_normalize_schedule_days(getattr(p, "tracker_schedule_days", None))
            sent_dates = sent_by_proj.get(p.id, set())
            days_payload: list[dict] = []
            for di, key in enumerate(_FU_DAY_KEYS):
                d = (week_start + timedelta(days=di)).date()
                days_payload.append(
                    {
                        "key": key,
                        "label": _FU_DAY_LABELS[key],
                        "expected": key in schedule,
                        "sentByMe": d in sent_dates,
                    }
                )
            t = teams.get(p.id)
            out_projects.append(
                {
                    "projectId": p.id,
                    "projectName": p.name,
                    "teamName": (t.name if t else None),
                    "scheduleDays": schedule,
                    "weekStartISO": week_start.isoformat().replace("+00:00", "Z"),
                    "weekEndISO": week_end.isoformat().replace("+00:00", "Z"),
                    "days": days_payload,
                }
            )

        return {
            "weekStartISO": week_start.isoformat().replace("+00:00", "Z"),
            "weekEndISO": week_end.isoformat().replace("+00:00", "Z"),
            "projects": out_projects,
        }
    except (OperationalError, Exception):
        return {
            "weekStartISO": week_start.isoformat().replace("+00:00", "Z"),
            "weekEndISO": week_end.isoformat().replace("+00:00", "Z"),
            "projects": [],
        }


@router.get("/follow-up/reminders")
def dashboard_follow_up_reminders(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Projects where today (UTC) is an expected tracker day and this user has not sent yet."""
    email = (current_user_email or "").strip().lower()
    now = datetime.now(timezone.utc)
    today = now.date()
    today_key = _FU_ISO_TO_KEY.get(now.isoweekday(), "mon")
    today_start, today_end = _fu_utc_day_bounds(today)
    reminders: list[dict] = []
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            return {"reminders": [], "todayKey": today_key}

        rows = (
            db.query(ProjectAssignment, TeamProject)
            .join(TeamProject, TeamProject.id == ProjectAssignment.project_id)
            .filter(ProjectAssignment.user_id == user.id)
            .all()
        )
        due_projects: list[TeamProject] = []
        for _, p in rows:
            sched = _fu_normalize_schedule_days(getattr(p, "tracker_schedule_days", None))
            if not sched or today_key not in sched:
                continue
            due_projects.append(p)

        if not due_projects:
            return {"reminders": [], "todayKey": today_key}

        tracker_today = (
            db.query(Email.subject)
            .filter(
                and_(
                    func.lower(Email.sender_email) == email,
                    Email.received_at >= today_start,
                    Email.received_at <= today_end,
                    Email.subject.isnot(None),
                    func.lower(Email.subject).like(f"%{_FU_TRACKER_SUB}%", escape="\\"),
                )
            )
            .all()
        )
        subjects = " ".join((s[0] or "").lower() for s in tracker_today if s and s[0])

        for p in due_projects:
            pn = (p.name or "").strip().lower()
            if not pn:
                continue
            if pn not in subjects:
                reminders.append({"projectId": p.id, "projectName": p.name})

        return {"reminders": reminders, "todayKey": today_key}
    except (OperationalError, Exception):
        return {"reminders": [], "todayKey": today_key}


@router.get("/follow-up/tracker/history")
def dashboard_follow_up_tracker_history(
    project_id: str = Query(..., alias="projectId", description="Team project id"),
    days: int = Query(90, ge=1, le=365),
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """This user's sent tracker-like messages for an assigned project (newest first)."""
    email = (current_user_email or "").strip().lower()
    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        user = db.query(User).filter(func.lower(User.email) == email).first()
        if not user:
            return {"projectId": project_id, "projectName": "", "emails": []}

        assigned = (
            db.query(ProjectAssignment)
            .filter(ProjectAssignment.user_id == user.id, ProjectAssignment.project_id == project_id)
            .first()
        )
        if not assigned:
            return {"projectId": project_id, "projectName": "", "emails": []}

        p = db.query(TeamProject).filter(TeamProject.id == project_id).first()
        if not p:
            return {"projectId": project_id, "projectName": "", "emails": []}

        name_pat = _fu_like_pat(p.name)
        if not name_pat:
            return {"projectId": p.id, "projectName": p.name, "emails": []}

        q = (
            db.query(Email.id, Email.subject, Email.received_at)
            .filter(
                and_(
                    func.lower(Email.sender_email) == email,
                    Email.received_at >= since,
                    Email.subject.isnot(None),
                    func.lower(Email.subject).like(f"%{_FU_TRACKER_SUB}%", escape="\\"),
                    func.lower(Email.subject).like(f"%{name_pat.lower()}%", escape="\\"),
                )
            )
            .order_by(Email.received_at.desc())
            .limit(200)
            .all()
        )
        emails = []
        for eid, subj, ra in q:
            if not ra:
                continue
            emails.append(
                {
                    "emailId": eid,
                    "subject": subj,
                    "receivedAt": ra.isoformat().replace("+00:00", "Z"),
                }
            )
        return {"projectId": p.id, "projectName": p.name, "emails": emails}
    except (OperationalError, Exception):
        return {"projectId": project_id, "projectName": "", "emails": []}
