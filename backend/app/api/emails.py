import base64
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, Body, Path, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel, Field
import httpx
from app.db.session import get_db
from app.db.models import Email, Attachment
from app.workers.tasks import backfill_emails_task, backfill_classify_emails_task
from app.config import get_settings
from app.graph.auth import get_auth_headers

router = APIRouter()


class BackfillBody(BaseModel):
    user_id: str | None = None  # If omitted, uses MAILBOX_EMAIL from .env
    folder_id: str = "inbox"
    days: int = 7  # Last N days; use 0 or all=True to sync all emails from the folder
    all: bool = False  # When True, sync all emails (ignores days)


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

    model_config = {"from_attributes": True, "populate_by_name": True}


class EmailsResponse(BaseModel):
    emails: list[EmailOut]
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

    model_config = {"from_attributes": True, "populate_by_name": True}


@router.get("/emails", response_model=EmailsResponse, response_model_by_alias=True)
def list_emails(
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
        q = db.query(Email)
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
                category=getattr(r, "ai_category", None),
                priorityLabel=getattr(r, "ai_priority_label", None),
                priorityScore=getattr(r, "ai_priority_score", None),
                aiStatus=getattr(r, "ai_status", None),
                aiProcessedAt=getattr(r, "ai_processed_at", None),
                processingStatus=getattr(r, "processing_status", None),
            )
            for r in rows
        ]
        return EmailsResponse(emails=emails, total=total, page=page, pageSize=page_size)
    except (OperationalError, Exception):
        return EmailsResponse(emails=[], total=0, page=page, pageSize=page_size)


@router.get("/emails/{email_id}", response_model=EmailDetailOut, response_model_by_alias=True)
def get_email(
    email_id: str = Path(..., description="Email UUID"),
    db: Session = Depends(get_db),
):
    """Get full email details including body and attachments (from stored data; uses Graph credentials during ingest)."""
    try:
        email = (
            db.query(Email)
            .options(joinedload(Email.attachments))
            .filter(Email.id == email_id)
            .first()
        )
        if not email:
            raise HTTPException(status_code=404, detail="Email not found")
        return EmailDetailOut(
            id=email.id,
            messageId=email.message_id,
            subject=email.subject,
            sender=email.sender_email,
            senderDisplayName=email.sender_display_name,
            toRecipients=email.to_recipients or [],
            ccRecipients=email.cc_recipients or [],
            receivedAt=email.received_at,
            sentAt=email.sent_at,
            folder=email.folder_name or email.folder_id or "",
            bodyPreview=email.body_preview,
            bodyContent=email.body_content,
            bodyContentType=email.body_content_type,
            attachments=[AttachmentOut(id=a.id, name=a.name, content_type=a.content_type, size=a.size, is_inline=a.is_inline) for a in email.attachments],
            status=email.status,
            summary=getattr(email, "ai_summary", None) or None,
            category=getattr(email, "ai_category", None),
            priorityLabel=getattr(email, "ai_priority_label", None),
            priorityScore=getattr(email, "ai_priority_score", None),
            suggestedReplies=getattr(email, "ai_suggested_replies", None) or [],
            aiStatus=getattr(email, "ai_status", None),
            aiProcessedAt=getattr(email, "ai_processed_at", None),
            processingStatus=getattr(email, "processing_status", None),
            aiErrorMessage=getattr(email, "ai_error_message", None),
        )
    except HTTPException:
        raise
    except (OperationalError, Exception):
        raise HTTPException(status_code=500, detail="Failed to load email")


@router.get("/emails/{email_id}/attachments/{attachment_id}", response_class=Response)
def get_attachment(
    email_id: str = Path(..., description="Email UUID"),
    attachment_id: str = Path(..., description="Attachment UUID"),
    download: bool = Query(False, description="If true, force download instead of inline display"),
    db: Session = Depends(get_db),
):
    """
    Stream attachment content from Microsoft Graph so it can be opened or downloaded.
    PDFs and images use inline disposition by default so they are viewable in the browser.
    """
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    att = db.query(Attachment).filter(Attachment.id == attachment_id, Attachment.email_id == email_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if not att.graph_attachment_id or not email.graph_id:
        raise HTTPException(status_code=400, detail="Attachment content not available (missing Graph reference)")
    user_id = get_settings().mailbox_email
    if not user_id or not user_id.strip():
        raise HTTPException(
            status_code=400,
            detail="Mailbox not configured. Set MAILBOX_EMAIL in backend .env to view attachments.",
        )
    url = (
        f"https://graph.microsoft.com/v1.0/users/{user_id.strip()}/messages/{email.graph_id}"
        f"/attachments/{att.graph_attachment_id}"
    )
    with httpx.Client(timeout=60.0) as client:
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
def trigger_backfill(body: BackfillBody = Body(...)):
    """
    Enqueue a job to sync existing emails from Microsoft Graph into the database.
    user_id: mailbox to sync (email or Azure AD object ID). If omitted, uses MAILBOX_EMAIL from .env.
    PostgreSQL and Celery worker must be running for emails to appear.
    """
    user_id = body.user_id or get_settings().mailbox_email
    if not user_id or not user_id.strip():
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={"error": "user_id is required. Set it in the request body or set MAILBOX_EMAIL in .env."},
        )
    try:
        days = 0 if body.all else body.days
        task = backfill_emails_task.delay(user_id.strip(), body.folder_id, days)
        msg = "Backfill (all emails) enqueued." if body.all else f"Backfill (last {body.days} days) enqueued."
        return {"ok": True, "taskId": task.id, "userId": user_id.strip(), "message": f"{msg} Run a Celery worker to process it; then refresh the dashboard."}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": str(e)})


@router.post("/emails/{email_id}/retry-ai")
def retry_ai_classification(
    email_id: str = Path(..., description="Email UUID"),
    db: Session = Depends(get_db),
):
    """Re-enqueue AI classification for a single email (e.g. after failure)."""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    from app.workers.tasks import classify_email_task
    classify_email_task.delay(email_id)
    return {"ok": True, "message": "Classification re-queued for this email.", "emailId": email_id}


@router.post("/emails/classify-backfill")
def trigger_classify_backfill(body: dict | None = Body(None)):
    """
    Enqueue AI classification for all emails that don't have it yet (e.g. ingested before Phase 2).
    Run this once to fill category/priority/summary for existing emails. Requires OPENAI_API_KEY and Celery worker.
    Optional body: {"limit": 500} to cap how many to enqueue (default 500).
    """
    settings = get_settings()
    if not (settings.openai_api_key and settings.openai_api_key.strip()):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={
                "error": "OPENAI_API_KEY is not set. Add it to backend .env to run AI classification.",
            },
        )
    raw_limit = (body or {}).get("limit", 500)
    try:
        limit = int(raw_limit) if raw_limit is not None else 500
        limit = max(1, min(2000, limit))
    except (TypeError, ValueError):
        limit = 500
    try:
        task = backfill_classify_emails_task.delay(limit=limit)
        return {
            "ok": True,
            "taskId": task.id,
            "message": "Classification jobs enqueued. Refresh the dashboard after the worker finishes.",
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": str(e)})
