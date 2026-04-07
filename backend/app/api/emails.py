import base64
import csv
import html
import io
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote
from fastapi import APIRouter, Depends, Query, Body, Path, HTTPException, Header
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel, Field
from app.db.session import get_db
from app.db.models import Email, Attachment, User
from app.workers.tasks import (
    backfill_emails_task,
    backfill_classify_emails_task,
    enqueue_classify_email_task,
)
from app.config import get_settings
from app.graph.auth import get_auth_headers
from app.api.deps import get_current_user_email
from app.http_client import httpx_client

router = APIRouter()


def _is_admin_actor(email_addr: str, db: Session) -> bool:
    """True if address is in ADMIN_EMAILS or has User.role Admin (same gate as admin APIs)."""
    s = get_settings()
    admin_list = [e.strip().lower() for e in (s.admin_emails or "").split(",") if e.strip()]
    if admin_list and email_addr.strip().lower() in admin_list:
        return True
    u = db.query(User).filter(User.email == email_addr.strip().lower()).first()
    return bool(u and getattr(u, "role", None) == "Admin")


def _can_read_email_mailbox(email: Email, current_user_email: str, db: Session) -> bool:
    owner = (email.mailbox_owner_email or "").strip().lower()
    if owner and owner == current_user_email.strip().lower():
        return True
    return _is_admin_actor(current_user_email, db)


def _parse_graph_recipient_list(recipients: list | None) -> list[dict]:
    """Normalize Microsoft Graph recipient list to {email, name}."""
    out: list[dict] = []
    for r in recipients or []:
        if not isinstance(r, dict):
            continue
        ea = r.get("emailAddress") or {}
        out.append({"email": ea.get("address"), "name": ea.get("name")})
    return out


def _format_address_list(recipients: list | None) -> str:
    """Human-readable To/Cc/Bcc for CSV (name <email> where useful)."""
    if not recipients:
        return ""
    parts: list[str] = []
    for r in recipients:
        if not isinstance(r, dict):
            continue
        email = r.get("email")
        if not email and isinstance(r.get("emailAddress"), dict):
            email = (r.get("emailAddress") or {}).get("address")
        name = r.get("name")
        if not name and isinstance(r.get("emailAddress"), dict):
            name = (r.get("emailAddress") or {}).get("name")
        if email and name and str(name) != str(email):
            parts.append(f"{name} <{email}>")
        elif email:
            parts.append(str(email))
    return ", ".join(parts)


def _bcc_from_email(email: Email) -> list[dict]:
    """Prefer persisted bcc_recipients; else raw Graph payload."""
    col = getattr(email, "bcc_recipients", None)
    if isinstance(col, list) and col:
        return col
    rp = getattr(email, "raw_payload", None)
    if isinstance(rp, dict) and rp.get("bccRecipients"):
        return _parse_graph_recipient_list(rp.get("bccRecipients"))
    return []


def _format_sender_line(sender_email: str, display_name: str | None) -> str:
    if display_name and display_name.strip() and display_name.strip() != (sender_email or "").strip():
        return f"{display_name.strip()} <{sender_email}>"
    return sender_email or ""


def _response_time_human(ms: int) -> str:
    if ms < 0:
        return "—"
    sec = ms // 1000
    minute = sec // 60
    hr = minute // 60
    day = hr // 24
    if day > 0:
        return f"{day}d"
    if hr > 0:
        return f"{hr}h"
    if minute > 0:
        return f"{minute}m"
    if sec > 0:
        return f"{sec}s"
    return "<1s"


def _display_category(row: Any) -> str | None:
    """Category for display (History/Inbox). Prefer ai_category, then assigned_team, then 'General' if classified."""
    cat = getattr(row, "ai_category", None)
    if (cat or "").strip():
        return (cat or "").strip()
    team = getattr(row, "assigned_team", None)
    if (team or "").strip():
        return (team or "").strip()
    if getattr(row, "ai_processed_at", None) is not None:
        return "General"
    return None


def _build_reply_comment_html(body: "GraphReplyAllBody") -> str:
    ct = (body.content_type or "Text").strip().upper()
    if ct == "HTML":
        return body.comment
    esc = html.escape(body.comment)
    return (
        f'<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">'
        f"{esc.replace(chr(10), '<br/>').replace(chr(13), '')}</div>"
    )


def _graph_reply_all_delegated(graph_access_token: str, graph_message_id: str, comment_html: str) -> None:
    """Send reply-all via delegated token (Graph /me = mailbox owner)."""
    mid = quote(graph_message_id.strip(), safe="")
    url = f"https://graph.microsoft.com/v1.0/me/messages/{mid}/replyAll"
    with httpx_client(timeout=45.0) as client:
        r = client.post(
            url,
            headers={
                "Authorization": f"Bearer {graph_access_token}",
                "Content-Type": "application/json",
            },
            json={"comment": comment_html},
        )
    if r.status_code in (200, 202):
        return
    msg = (r.text or "")[:800]
    try:
        err = r.json().get("error") or {}
        if isinstance(err, dict) and err.get("message"):
            msg = str(err.get("message"))[:800]
    except Exception:
        pass
    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"Microsoft Graph rejected the token or access: {msg}")
    raise HTTPException(status_code=502, detail=f"Microsoft Graph error ({r.status_code}): {msg}")


class BackfillBody(BaseModel):
    user_id: str | None = None  # If omitted, uses MAILBOX_EMAIL from .env
    folder_id: str = "inbox"
    days: int = 7  # Last N days; use 0 or all=True to sync all emails from the folder
    all: bool = False  # When True, sync all emails (ignores days)
    from_date: str | None = None  # YYYY-MM-DD: sync only from this date (inclusive)
    to_date: str | None = None  # YYYY-MM-DD: sync only up to this date (inclusive)


class EmailOut(BaseModel):
    id: str
    message_id: str = Field(alias="messageId")
    subject: str | None
    sender: str
    received_at: datetime = Field(alias="receivedAt")
    folder: str | None
    status: str
    # Phase 2 — AI
    summary: str | None = None
    category: str | None = None
    priority_label: str | None = Field(None, alias="priorityLabel")
    priority_score: float | None = Field(None, alias="priorityScore")
    ai_status: str | None = Field(None, alias="aiStatus")  # pending | completed | failed
    ai_processed_at: datetime | None = Field(None, alias="aiProcessedAt")
    processing_status: str | None = Field(None, alias="processingStatus")  # received | ingested | classified | failed
    # Phase 3 — department/team (Tech, Sales, Accounts, etc.)
    assigned_team: str | None = Field(None, alias="assignedTeam")
    mailbox_owner_email: str | None = Field(None, alias="mailboxOwnerEmail")

    model_config = {"from_attributes": True, "populate_by_name": True}


class EmailsResponse(BaseModel):
    emails: list[EmailOut]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")

    model_config = {"populate_by_name": True}


class ConversationOut(BaseModel):
    """One email thread (conversation) for Threads view."""
    conversation_id: str = Field(alias="conversationId")
    subject: str | None = None
    last_received_at: datetime = Field(alias="lastReceivedAt")
    message_count: int = Field(alias="messageCount")
    participants_preview: str = Field(default="", alias="participantsPreview")

    model_config = {"populate_by_name": True}


class ConversationsResponse(BaseModel):
    conversations: list[ConversationOut]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")

    model_config = {"populate_by_name": True}


class AttachmentOut(BaseModel):
    id: str
    name: str
    content_type: str | None
    size: int | None
    is_inline: bool = False

    model_config = {"from_attributes": True}


class EmailDetailOut(BaseModel):
    id: str
    message_id: str = Field(alias="messageId")
    subject: str | None
    sender: str
    sender_display_name: str | None = Field(None, alias="senderDisplayName")
    to_recipients: list[dict] = Field(default_factory=list, alias="toRecipients")
    cc_recipients: list[dict] = Field(default_factory=list, alias="ccRecipients")
    bcc_recipients: list[dict] = Field(default_factory=list, alias="bccRecipients")
    received_at: datetime = Field(alias="receivedAt")
    sent_at: datetime | None = Field(None, alias="sentAt")
    folder: str | None
    body_preview: str | None = Field(None, alias="bodyPreview")
    body_content: str | None = Field(None, alias="bodyContent")
    body_content_type: str | None = Field(None, alias="bodyContentType")
    attachments: list[AttachmentOut] = Field(default_factory=list)
    status: str
    # Phase 2 — AI
    summary: str | None = None
    category: str | None = None
    priority_label: str | None = Field(None, alias="priorityLabel")
    priority_score: float | None = Field(None, alias="priorityScore")
    suggested_replies: list[str] = Field(default_factory=list, alias="suggestedReplies")
    ai_status: str | None = Field(None, alias="aiStatus")
    ai_processed_at: datetime | None = Field(None, alias="aiProcessedAt")
    processing_status: str | None = Field(None, alias="processingStatus")
    ai_error_message: str | None = Field(None, alias="aiErrorMessage")
    graph_id: str | None = Field(None, alias="graphId")
    mailbox_owner_email: str | None = Field(None, alias="mailboxOwnerEmail")
    deleted_at: datetime | None = Field(None, alias="deletedAt")

    model_config = {"from_attributes": True, "populate_by_name": True}


class GraphReplyAllBody(BaseModel):
    """Body text for Microsoft Graph replyAll (delegated user token)."""

    comment: str = Field(..., min_length=1, max_length=500_000)
    content_type: str = Field("Text", alias="contentType")

    model_config = {"populate_by_name": True}


class ThreadEmailsResponse(BaseModel):
    """All emails in a thread, chronological order."""
    conversation_id: str = Field(alias="conversationId")
    emails: list[EmailDetailOut]

    model_config = {"populate_by_name": True}


@router.get("/emails", response_model=EmailsResponse, response_model_by_alias=True)
def list_emails(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=500),
    search: str | None = Query(None),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    category: str | None = Query(None, description="Filter by AI category (e.g. Sales, Accounts, HR)"),
    priority_label: str | None = Query(None, alias="priorityLabel", description="Filter by priority label"),
):
    try:
        q = db.query(Email).filter(
            Email.mailbox_owner_email == current_user_email,
            Email.deleted_at.is_(None),
        )
        if search and search.strip():
            s = f"%{search.strip()}%"
            q = q.filter(
                (Email.subject.ilike(s)) | (Email.sender_email.ilike(s)) | (Email.message_id.ilike(s))
            )
        if category and category.strip():
            q = q.filter(Email.ai_category == category.strip())
        if priority_label and priority_label.strip():
            q = q.filter(Email.ai_priority_label == priority_label.strip())
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        if to_date:
            try:
                dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
                dt = dt + timedelta(days=1)
                q = q.filter(Email.received_at < dt)
            except ValueError:
                pass
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        emails = [
            EmailOut(
                id=r.id,
                messageId=r.message_id,
                subject=r.subject,
                sender=r.sender_email,
                receivedAt=r.received_at,
                folder=r.folder_name or r.folder_id or "",
                status=r.status,
                summary=getattr(r, "ai_summary", None) or None,
                category=_display_category(r),
                priorityLabel=getattr(r, "ai_priority_label", None),
                priorityScore=getattr(r, "ai_priority_score", None),
                aiStatus=getattr(r, "ai_status", None),
                aiProcessedAt=getattr(r, "ai_processed_at", None),
                processingStatus=getattr(r, "processing_status", None),
                assignedTeam=getattr(r, "assigned_team", None),
                mailboxOwnerEmail=getattr(r, "mailbox_owner_email", None),
            )
            for r in rows
        ]
        return EmailsResponse(emails=emails, total=total, page=page, pageSize=page_size)
    except (OperationalError, Exception):
        return EmailsResponse(emails=[], total=0, page=page, pageSize=page_size)


@router.get("/emails/conversations", response_model=ConversationsResponse, response_model_by_alias=True)
def list_conversations(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
):
    """List real email threads (Microsoft Graph conversationId only). One thread = one reply chain."""
    try:
        q = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email == current_user_email,
                Email.deleted_at.is_(None),
                Email.conversation_id.isnot(None),
                Email.conversation_id != "",
            )
            .order_by(Email.received_at.desc())
        )
        if search and search.strip():
            s = f"%{search.strip()}%"
            q = q.filter(
                (Email.subject.ilike(s)) | (Email.sender_email.ilike(s))
            )
        rows = q.limit(3000).all()
        by_cid: dict[str, list] = {}
        for r in rows:
            cid = (r.conversation_id or "").strip()
            if not cid or cid.startswith("thread:"):
                continue
            if cid not in by_cid:
                by_cid[cid] = []
            by_cid[cid].append(r)
        threads = []
        for cid, emails in by_cid.items():
            latest = emails[0]
            participants = set()
            for e in emails[:10]:
                participants.add(e.sender_email or "")
                if e.to_recipients:
                    for rec in (e.to_recipients if isinstance(e.to_recipients, list) else []):
                        addr = (rec.get("email") or rec.get("emailAddress", {}).get("address")) if isinstance(rec, dict) else None
                        if addr:
                            participants.add(addr)
            participants.discard("")
            preview = ", ".join(sorted(participants)[:5])
            if len(participants) > 5:
                preview += "…"
            threads.append(
                ConversationOut(
                    conversationId=cid,
                    subject=latest.subject,
                    lastReceivedAt=latest.received_at,
                    messageCount=len(emails),
                    participantsPreview=preview,
                )
            )
        threads.sort(key=lambda t: t.last_received_at, reverse=True)
        total = len(threads)
        start = (page - 1) * page_size
        page_threads = threads[start : start + page_size]
        return ConversationsResponse(
            conversations=page_threads,
            total=total,
            page=page,
            pageSize=page_size,
        )
    except (OperationalError, Exception):
        return ConversationsResponse(conversations=[], total=0, page=page, pageSize=page_size)


@router.get("/emails/conversations/replies-export")
def export_thread_replies_csv(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    date_from: str | None = Query(None, alias="from", description="Inclusive start YYYY-MM-DD"),
    date_to: str | None = Query(None, alias="to", description="Inclusive end YYYY-MM-DD"),
    conversation_id: str | None = Query(None, alias="conversationId", description="Optional: one thread only"),
):
    """
    CSV of reply messages in a date range: response time vs previous message, subjects, From/To/Cc/Bcc.
    Bcc is taken from stored Graph payload when available.
    """
    now = datetime.now(timezone.utc)
    if (date_from is None) ^ (date_to is None):
        raise HTTPException(
            status_code=400,
            detail="Provide both 'from' and 'to' (YYYY-MM-DD), or omit both to default to the last 90 days.",
        )
    try:
        if date_from is None:
            end_d = now.date()
            start_d = end_d - timedelta(days=90)
            start_dt = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
            end_dt = datetime(end_d.year, end_d.month, end_d.day, tzinfo=timezone.utc) + timedelta(days=1)
            label_from = start_d.isoformat()
            label_to = end_d.isoformat()
        else:
            d0 = datetime.fromisoformat(date_from.strip()).date()
            d1 = datetime.fromisoformat(date_to.strip()).date()
            start_dt = datetime(d0.year, d0.month, d0.day, tzinfo=timezone.utc)
            end_dt = datetime(d1.year, d1.month, d1.day, tzinfo=timezone.utc) + timedelta(days=1)
            label_from = d0.isoformat()
            label_to = d1.isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date; use YYYY-MM-DD.")

    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="'from' must be before 'to'.")

    owner = (current_user_email or "").strip()
    if not owner:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cid_list: list[str]
    if conversation_id and conversation_id.strip():
        cid = conversation_id.strip()
        if cid.startswith("thread:"):
            raise HTTPException(status_code=400, detail="Invalid conversation id")
        exists = (
            db.query(Email.id)
            .filter(
                Email.mailbox_owner_email == owner,
                Email.conversation_id == cid,
                Email.deleted_at.is_(None),
            )
            .first()
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        cid_list = [cid]
    else:
        cid_rows = (
            db.query(Email.conversation_id)
            .filter(
                Email.mailbox_owner_email == owner,
                Email.deleted_at.is_(None),
                Email.received_at >= start_dt,
                Email.received_at < end_dt,
                Email.conversation_id.isnot(None),
                Email.conversation_id != "",
            )
            .filter(~Email.conversation_id.like("thread:%"))
            .distinct()
            .all()
        )
        cid_list = [r[0] for r in cid_rows if r[0]]

    if not cid_list:
        rows_out: list[list[Any]] = []
    else:
        q = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email == owner,
                Email.deleted_at.is_(None),
                Email.conversation_id.in_(cid_list),
            )
            .order_by(Email.conversation_id.asc(), Email.received_at.asc())
        )
        all_rows = q.all()
        rows_out = []
        by_cid: dict[str, list[Email]] = {}
        for e in all_rows:
            c = (e.conversation_id or "").strip()
            if not c or c.startswith("thread:"):
                continue
            by_cid.setdefault(c, []).append(e)
        for cid_key, thread_msgs in by_cid.items():
            thread_msgs.sort(key=lambda x: x.received_at)
            root_subject = thread_msgs[0].subject if thread_msgs else ""
            for i in range(1, len(thread_msgs)):
                prev, rep = thread_msgs[i - 1], thread_msgs[i]
                if rep.received_at < start_dt or rep.received_at >= end_dt:
                    continue
                delta = rep.received_at - prev.received_at
                ms = int(delta.total_seconds() * 1000)
                hours = round(delta.total_seconds() / 3600.0, 4)
                bcc_list = _bcc_from_email(rep)
                rows_out.append(
                    [
                        cid_key,
                        rep.received_at.isoformat(),
                        _response_time_human(ms),
                        hours,
                        root_subject or "",
                        prev.subject or "",
                        rep.subject or "",
                        _format_sender_line(rep.sender_email, rep.sender_display_name),
                        _format_address_list(rep.to_recipients),
                        _format_address_list(rep.cc_recipients),
                        _format_address_list(bcc_list),
                        _format_sender_line(prev.sender_email, prev.sender_display_name),
                    ]
                )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "conversation_id",
            "reply_received_at_utc",
            "response_time",
            "response_time_hours",
            "thread_root_subject",
            "previous_message_subject",
            "reply_subject",
            "reply_from",
            "reply_to",
            "reply_cc",
            "reply_bcc",
            "previous_message_from",
        ]
    )
    writer.writerows(rows_out)
    csv_text = "\ufeff" + buf.getvalue()
    safe_from = label_from.replace(":", "-")
    safe_to = label_to.replace(":", "-")
    filename = f"thread-replies-{safe_from}-to-{safe_to}.csv"
    return Response(
        content=csv_text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/emails/backfill-conversation-ids")
def backfill_conversation_ids(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    """Fetch conversationId from Graph for emails that don't have it. Run this so Threads view shows reply chains (no need to re-login)."""
    try:
        rows = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email == current_user_email,
                Email.deleted_at.is_(None),
                Email.conversation_id.is_(None),
                Email.graph_id.isnot(None),
                Email.graph_id != "",
            )
            .limit(limit)
            .all()
        )
        if not rows:
            return {"ok": True, "updated": 0, "message": "No emails need conversation ID."}
        mailbox = (current_user_email or "").strip()
        if not mailbox:
            return {"ok": False, "updated": 0, "error": "User email required."}
        updated = 0
        with httpx_client(timeout=15.0) as client:
            for email in rows:
                try:
                    r = client.get(
                        f"https://graph.microsoft.com/v1.0/users/{mailbox}/messages/{email.graph_id}",
                        headers=get_auth_headers(),
                        params={"$select": "conversationId"},
                    )
                    if r.status_code != 200:
                        continue
                    data = r.json()
                    cid = (data.get("conversationId") or "").strip()
                    if cid:
                        email.conversation_id = cid
                        db.commit()
                        updated += 1
                except Exception:
                    continue
        return {"ok": True, "updated": updated, "message": f"Updated {updated} email(s). Refresh Threads to see them."}
    except Exception as e:
        return {"ok": False, "updated": 0, "error": str(e)}


@router.get("/emails/conversations/{conversation_id:path}/emails", response_model=ThreadEmailsResponse, response_model_by_alias=True)
def get_conversation_emails(
    conversation_id: str = Path(..., description="Conversation/thread ID"),
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Get all emails in a thread (chronological order). Only real reply chain by Graph conversationId."""
    try:
        rows = (
            db.query(Email)
            .filter(
                Email.mailbox_owner_email == current_user_email,
                Email.deleted_at.is_(None),
                Email.conversation_id == conversation_id,
            )
            .order_by(Email.received_at.asc())
            .all()
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Conversation not found")
        out = []
        for email in rows:
            atts = db.query(Attachment).filter(Attachment.email_id == email.id).all()
            out.append(
                EmailDetailOut(
                    id=email.id,
                    messageId=email.message_id,
                    subject=email.subject,
                    sender=email.sender_email,
                    senderDisplayName=email.sender_display_name,
                    toRecipients=email.to_recipients or [],
                    ccRecipients=email.cc_recipients or [],
                    bccRecipients=_bcc_from_email(email),
                    receivedAt=email.received_at,
                    sentAt=email.sent_at,
                    folder=email.folder_name or email.folder_id or "",
                    bodyPreview=email.body_preview,
                    bodyContent=email.body_content,
                    bodyContentType=email.body_content_type,
                    attachments=[AttachmentOut(id=a.id, name=a.name, content_type=a.content_type, size=a.size, is_inline=a.is_inline) for a in atts],
                    status=email.status,
                    summary=getattr(email, "ai_summary", None) or None,
                    category=_display_category(email),
                    priorityLabel=getattr(email, "ai_priority_label", None),
                    priorityScore=getattr(email, "ai_priority_score", None),
                    suggestedReplies=getattr(email, "ai_suggested_replies", None) or [],
                    aiStatus=getattr(email, "ai_status", None),
                    aiProcessedAt=getattr(email, "ai_processed_at", None),
                    processingStatus=getattr(email, "processing_status", None),
                    aiErrorMessage=getattr(email, "ai_error_message", None),
                    graphId=getattr(email, "graph_id", None),
                    mailboxOwnerEmail=getattr(email, "mailbox_owner_email", None),
                    deletedAt=getattr(email, "deleted_at", None),
                )
            )
        return ThreadEmailsResponse(conversationId=conversation_id, emails=out)
    except HTTPException:
        raise
    except (OperationalError, Exception):
        raise HTTPException(status_code=500, detail="Failed to load conversation")


@router.get("/emails/{email_id}", response_model=EmailDetailOut, response_model_by_alias=True)
def get_email(
    email_id: str = Path(..., description="Email UUID"),
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Get full email details including body and attachments (from stored data; uses Graph credentials during ingest)."""
    try:
        email = db.query(Email).filter(Email.id == email_id).first()
        if not email:
            raise HTTPException(status_code=404, detail="Email not found")
        if not _can_read_email_mailbox(email, current_user_email, db):
            raise HTTPException(status_code=404, detail="Email not found")
        atts = db.query(Attachment).filter(Attachment.email_id == email_id).all()
        return EmailDetailOut(
            id=email.id,
            messageId=email.message_id,
            subject=email.subject,
            sender=email.sender_email,
            senderDisplayName=email.sender_display_name,
            toRecipients=email.to_recipients or [],
            ccRecipients=email.cc_recipients or [],
            bccRecipients=_bcc_from_email(email),
            receivedAt=email.received_at,
            sentAt=email.sent_at,
            folder=email.folder_name or email.folder_id or "",
            bodyPreview=email.body_preview,
            bodyContent=email.body_content,
            bodyContentType=email.body_content_type,
            attachments=[AttachmentOut(id=a.id, name=a.name, content_type=a.content_type, size=a.size, is_inline=a.is_inline) for a in atts],
            status=email.status,
            summary=getattr(email, "ai_summary", None) or None,
            category=_display_category(email),
            priorityLabel=getattr(email, "ai_priority_label", None),
            priorityScore=getattr(email, "ai_priority_score", None),
            suggestedReplies=getattr(email, "ai_suggested_replies", None) or [],
            aiStatus=getattr(email, "ai_status", None),
            aiProcessedAt=getattr(email, "ai_processed_at", None),
            processingStatus=getattr(email, "processing_status", None),
            aiErrorMessage=getattr(email, "ai_error_message", None),
            graphId=getattr(email, "graph_id", None),
            mailboxOwnerEmail=getattr(email, "mailbox_owner_email", None),
            deletedAt=getattr(email, "deleted_at", None),
        )
    except HTTPException:
        raise
    except (OperationalError, Exception):
        raise HTTPException(status_code=500, detail="Failed to load email")


@router.post("/emails/{email_id}/reply-all")
def post_email_reply_all(
    email_id: str = Path(..., description="Email UUID"),
    body: GraphReplyAllBody = Body(...),
    current_user_email: str = Depends(get_current_user_email),
    graph_access_token: str = Header(..., alias="X-Microsoft-Graph-Access-Token"),
    db: Session = Depends(get_db),
):
    """
    Send a reply-all using the signed-in user's Microsoft Graph delegated token.
    Recipients/threading are handled by Graph (same as Outlook Reply All).
    """
    token = graph_access_token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Microsoft Graph access token")

    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if not _can_read_email_mailbox(email, current_user_email, db):
        raise HTTPException(status_code=404, detail="Email not found")
    if email.deleted_at is not None:
        raise HTTPException(status_code=400, detail="This message was removed from History; restore it before replying.")

    owner = (email.mailbox_owner_email or "").strip().lower()
    if owner != current_user_email.strip().lower():
        raise HTTPException(
            status_code=403,
            detail="You can only send replies for emails in your own mailbox.",
        )
    gid = getattr(email, "graph_id", None)
    if not gid or not str(gid).strip():
        raise HTTPException(
            status_code=400,
            detail="This message has no Microsoft Graph id; reply is not available.",
        )

    comment_html = _build_reply_comment_html(body)
    _graph_reply_all_delegated(token, str(gid).strip(), comment_html)
    return {"ok": True}


@router.get("/emails/{email_id}/attachments/{attachment_id}", response_class=Response)
def get_attachment(
    email_id: str = Path(..., description="Email UUID"),
    attachment_id: str = Path(..., description="Attachment UUID"),
    download: bool = Query(False, description="If true, force download instead of inline display"),
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """
    Stream attachment content from Microsoft Graph so it can be opened or downloaded.
    PDFs and images use inline disposition by default so they are viewable in the browser.
    """
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if not _can_read_email_mailbox(email, current_user_email, db):
        raise HTTPException(status_code=404, detail="Email not found")
    att = db.query(Attachment).filter(Attachment.id == attachment_id, Attachment.email_id == email_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if not att.graph_attachment_id or not email.graph_id:
        raise HTTPException(status_code=400, detail="Attachment content not available (missing Graph reference)")
    mailbox = email.mailbox_owner_email
    if not mailbox or not mailbox.strip():
        raise HTTPException(status_code=400, detail="Attachment not available for this email.")
    url = (
        f"https://graph.microsoft.com/v1.0/users/{mailbox.strip()}/messages/{email.graph_id}"
        f"/attachments/{att.graph_attachment_id}"
    )
    with httpx_client(timeout=60.0) as client:
        r = client.get(url, headers=get_auth_headers())
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch attachment from mailbox")
    data = r.json()
    if data.get("@odata.type") != "#microsoft.graph.fileAttachment":
        raise HTTPException(status_code=400, detail="Only file attachments can be opened")
    content_b64 = data.get("contentBytes")
    if not content_b64:
        raise HTTPException(status_code=502, detail="Attachment has no content")
    try:
        content = base64.b64decode(content_b64)
    except Exception:
        raise HTTPException(status_code=502, detail="Invalid attachment content")
    content_type = (att.content_type or data.get("contentType") or "application/octet-stream").split(";")[0].strip()
    # Sanitize filename for Content-Disposition
    filename = (att.name or "attachment").replace('"', "'").replace("\\", "_")
    disposition = "attachment" if download else "inline"
    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "private, max-age=300",
        },
    )


@router.post("/emails/backfill")
def trigger_backfill(
    body: BackfillBody = Body(...),
    current_user_email: str = Depends(get_current_user_email),
):
    """
    Enqueue a job to sync existing emails from Microsoft Graph into the database.
    user_id: mailbox to sync. If omitted, uses the logged-in user's email (X-User-Email).
    Users can only sync their own mailbox unless body.user_id equals current user.
    """
    user_id = body.user_id or current_user_email
    if not user_id or not user_id.strip():
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={"error": "user_id is required. Set it in the request body or send X-User-Email header."},
        )
    if body.user_id is not None and body.user_id.strip().lower() != current_user_email:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"error": "You can only sync your own mailbox."})
    try:
        uid = user_id.strip()
        if "@" in uid:
            uid = uid.lower()
        from_date = (body.from_date or "").strip() or None
        to_date = (body.to_date or "").strip() or None
        from app.workers.user_queue import user_queue_incr

        user_queue_incr(uid, 1)
        user_queue_incr(uid, 1)
        if body.from_date or body.to_date:
            days = 0
            task_inbox = backfill_emails_task.delay(uid, "inbox", days, from_date, to_date)
            task_sent = backfill_emails_task.delay(uid, "sentitems", days, from_date, to_date)
            msg = f"Backfill ({from_date or '…'} to {to_date or '…'}) enqueued for Inbox and Sent Items."
        else:
            days = 0 if body.all else body.days
            task_inbox = backfill_emails_task.delay(uid, "inbox", days)
            task_sent = backfill_emails_task.delay(uid, "sentitems", days)
            msg = "Backfill enqueued for Inbox and Sent Items." if body.all else f"Backfill (last {body.days} days) enqueued for Inbox and Sent Items."
        return {
            "ok": True,
            "taskId": task_inbox.id,
            "taskIds": [task_inbox.id, task_sent.id],
            "userId": uid,
            "message": f"{msg} Your sent replies will appear in Threads. Run a Celery worker; then refresh.",
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.post("/emails/{email_id}/soft-delete")
def soft_delete_email(
    email_id: str = Path(..., description="Email UUID"),
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Remove email from the user's History (soft delete). Admins can review under Admin → Deleted mail."""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    owner = (email.mailbox_owner_email or "").strip().lower()
    if owner != (current_user_email or "").strip().lower():
        raise HTTPException(status_code=404, detail="Email not found")
    if email.deleted_at is None:
        email.deleted_at = datetime.now(timezone.utc)
        email.deleted_by_email = (current_user_email or "").strip().lower()
        db.commit()
    return {"ok": True, "emailId": email_id}


@router.post("/emails/{email_id}/retry-ai")
def retry_ai_classification(
    email_id: str = Path(..., description="Email UUID"),
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """Re-enqueue AI classification for a single email (e.g. after failure)."""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.mailbox_owner_email != current_user_email:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Email not found")
    enqueue_classify_email_task(email_id, current_user_email)
    return {"ok": True, "message": "Classification re-queued for this email.", "emailId": email_id}


@router.post("/emails/classify-backfill")
def trigger_classify_backfill(
    body: dict | None = Body(None),
    current_user_email: str = Depends(get_current_user_email),
):
    """
    Enqueue AI classification for emails that don't have it yet (scoped to current user's mailbox).
    Optional body: {"limit": 500} to cap how many to enqueue (default 500).
    """
    settings = get_settings()
    use_ollama = bool(settings.ollama_base_url and settings.ollama_base_url.strip())
    use_openai = bool(settings.openai_api_key and settings.openai_api_key.strip())
    if not use_ollama and not use_openai:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={
                "error": "No AI provider configured. Set OLLAMA_BASE_URL and/or OPENAI_API_KEY in backend .env to run AI classification.",
            },
        )
    raw_limit = (body or {}).get("limit", 500)
    try:
        limit = int(raw_limit) if raw_limit is not None else 500
        limit = max(1, min(2000, limit))
    except (TypeError, ValueError):
        limit = 500
    try:
        task = backfill_classify_emails_task.delay(limit=limit, mailbox_owner_email=current_user_email)
        return {
            "ok": True,
            "taskId": task.id,
            "message": "Classification jobs enqueued. Refresh the dashboard after the worker finishes.",
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": str(e)})
