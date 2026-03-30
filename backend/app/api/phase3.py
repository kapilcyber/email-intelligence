"""
Phase 3 APIs: escalations, leads, routing (assign team).
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.db.models import Email, EscalationThread, Team, User, RetagApprovalRequest
from app.api.deps import get_current_user_email_optional, get_current_user_email
from app.config import get_settings

router = APIRouter()


def _get_current_user_email_required():
    """Dependency that requires authenticated user (for mine=true)."""
    from app.api.deps import get_current_user_email
    return get_current_user_email


class EmailListItem(BaseModel):
    id: str
    messageId: str = Field(alias="messageId")
    subject: str | None
    sender: str
    receivedAt: datetime = Field(alias="receivedAt")
    assignedTeam: str | None = Field(None, alias="assignedTeam")
    priorityLabel: str | None = Field(None, alias="priorityLabel")
    summary: str | None = None

    model_config = {"from_attributes": True, "populate_by_name": True}


def _email_to_item(r: Email, include_lead_label: bool = False, include_escalation_reasons: bool = False) -> dict:
    item = {
        "id": r.id,
        "messageId": r.message_id,
        "subject": r.subject,
        "sender": r.sender_email,
        "receivedAt": r.received_at,
        "assignedTeam": getattr(r, "assigned_team", None),
        "mailType": getattr(r, "ai_category", None),
        "priorityLabel": getattr(r, "ai_priority_label", None),
        "summary": getattr(r, "ai_summary", None),
        "mailboxOwner": getattr(r, "mailbox_owner_email", None),
        "isRead": getattr(r, "is_read", False),
    }
    if include_lead_label:
        item["leadLabel"] = getattr(r, "lead_label", None)
        meta = getattr(r, "lead_metadata", None)
        item["buyingSignals"] = (meta or {}).get("buying_signals", []) if isinstance(meta, dict) else []
    if include_escalation_reasons:
        meta = getattr(r, "escalation_metadata", None)
        item["escalationReasons"] = (meta or {}).get("reasons") if isinstance(meta, dict) else None
    rt = getattr(r, "retagged_at", None)
    if rt is not None:
        item["retaggedAt"] = rt.isoformat() if hasattr(rt, "isoformat") else str(rt)
        item["retaggedBy"] = getattr(r, "retagged_by_email", None)
        rm = getattr(r, "retag_metadata", None)
        if isinstance(rm, dict):
            parts = []
            if rm.get("wasEscalation"):
                parts.append("was escalation")
            if rm.get("wasLead"):
                parts.append(f"was lead ({rm.get('previousLeadLabel') or '?'})")
            prev = rm.get("previousAssignedTeam")
            if prev:
                parts.append(f"from team {prev}")
            prev_cat = rm.get("previousAiCategory")
            if prev_cat and not prev:
                parts.append(f"from category {prev_cat}")
            item["retagPreviousSummary"] = "; ".join(parts) if parts else None
    return item


@router.get("/escalations")
def list_escalations(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    from_date: str | None = Query(None, alias="from"),
    team: str | None = Query(None, description="Filter by assigned team"),
    mine: bool = Query(False, description="If true, return only escalations in the current user's mailbox"),
    current_user_email: str | None = Depends(get_current_user_email_optional),
):
    """List emails flagged as escalations (is_escalation=true). Use mine=true to see only your own mailbox escalations."""
    if mine and not current_user_email:
        raise HTTPException(status_code=401, detail="X-User-Email header is required to view your escalations")
    try:
        if not hasattr(Email, "is_escalation"):
            return {"escalations": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.is_escalation == True)
        if mine and current_user_email and hasattr(Email, "mailbox_owner_email"):
            q = q.filter(Email.mailbox_owner_email == current_user_email)
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        if team and team.strip() and hasattr(Email, "assigned_team"):
            q = q.filter(Email.assigned_team == team.strip())
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "escalations": [_email_to_item(r, include_escalation_reasons=True) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"escalations": [], "total": 0, "page": page, "pageSize": page_size}


@router.get("/escalation-threads")
def list_escalation_threads(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List continuous escalation threads (conversations that have at least one escalation)."""
    try:
        if not hasattr(EscalationThread, "conversation_id"):
            return {"threads": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(EscalationThread).order_by(EscalationThread.last_escalation_at.desc())
        total = q.count()
        rows = q.offset((page - 1) * page_size).limit(page_size).all()
        threads = [
            {
                "id": t.id,
                "conversationId": t.conversation_id,
                "firstEscalatedAt": t.first_escalated_at.isoformat() if t.first_escalated_at else None,
                "lastEscalationAt": t.last_escalation_at.isoformat() if t.last_escalation_at else None,
                "escalationCount": t.escalation_count,
                "lastEmailId": t.last_email_id,
            }
            for t in rows
        ]
        return {"threads": threads, "total": total, "page": page, "pageSize": page_size}
    except (OperationalError, Exception):
        return {"threads": [], "total": 0, "page": page, "pageSize": page_size}


@router.get("/leads")
def list_leads(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    label: str | None = Query(None, description="Filter by lead label: Hot, Warm, Cold"),
    team: str | None = Query(None, description="Filter by assigned team (team name from DB)"),
    from_date: str | None = Query(None, alias="from"),
    mine: bool = Query(False, description="If true, return only leads in the current user's mailbox"),
    current_user_email: str | None = Depends(get_current_user_email_optional),
):
    """List emails with a lead label (Hot/Warm/Cold). Use mine=true for the current user's leads."""
    if mine and not current_user_email:
        raise HTTPException(status_code=401, detail="X-User-Email header is required to view your leads")
    try:
        if not hasattr(Email, "lead_label"):
            return {"leads": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.lead_label.isnot(None))
        if mine and current_user_email and hasattr(Email, "mailbox_owner_email"):
            q = q.filter(Email.mailbox_owner_email == current_user_email)
        if label and label.strip():
            q = q.filter(Email.lead_label == label.strip())
        if team and team.strip() and hasattr(Email, "assigned_team"):
            q = q.filter(Email.assigned_team == team.strip())
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "leads": [_email_to_item(r, include_lead_label=True) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"leads": [], "total": 0, "page": page, "pageSize": page_size}


def _allowed_team_names(db: Session) -> set[str]:
    """Team names from DB so Escalations, Leads, Workflow and assign stay in sync."""
    return {t.name for t in db.query(Team).all()}


@router.patch("/emails/{email_id}/assign")
def assign_team(
    email_id: str,
    team: str = Query(..., description="Team name (must exist in teams table)"),
    db: Session = Depends(get_db),
):
    """Manually assign an email to a team (overrides routing). Uses teams from DB."""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if not hasattr(Email, "assigned_team"):
        raise HTTPException(status_code=501, detail="assigned_team not available")
    team_val = team.strip() if team else None
    if team_val:
        allowed = _allowed_team_names(db)
        if team_val not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid team. Allowed: {', '.join(sorted(allowed))}",
            )
    email.assigned_team = team_val
    db.commit()
    return {"ok": True, "emailId": email_id, "assignedTeam": email.assigned_team}


class RetagEmailBody(BaseModel):
    assigned_team: str = Field(..., alias="assignedTeam", description="Department/team name from teams table")

    model_config = {"populate_by_name": True}


class RetagRequestOut(BaseModel):
    id: str
    emailId: str = Field(alias="emailId")
    mailboxOwnerEmail: str = Field(alias="mailboxOwnerEmail")
    requestedByEmail: str = Field(alias="requestedByEmail")
    requestedTeam: str = Field(alias="requestedTeam")
    status: str
    requestedAt: datetime = Field(alias="requestedAt")
    reviewedAt: datetime | None = Field(None, alias="reviewedAt")
    reviewedByEmail: str | None = Field(None, alias="reviewedByEmail")
    reviewNote: str | None = Field(None, alias="reviewNote")

    model_config = {"populate_by_name": True}


def _is_admin_actor(db: Session, actor_email: str) -> bool:
    settings = get_settings()
    admin_list = [e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()]
    email_l = (actor_email or "").strip().lower()
    if email_l and email_l in admin_list:
        return True
    u = db.query(User).filter(User.email == email_l).first()
    return bool(u and (u.role or "") in ("Admin", "Manager"))


def _perform_retag(
    db: Session,
    email: Email,
    assigned_team: str,
    actor_email: str,
) -> None:
    if not hasattr(Email, "retagged_at"):
        raise HTTPException(status_code=501, detail="Retag not available on this database")
    team_val = (assigned_team or "").strip()
    if not team_val:
        raise HTTPException(status_code=400, detail="assignedTeam is required")
    allowed = _allowed_team_names(db)
    if team_val not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid team. Allowed: {', '.join(sorted(allowed))}",
        )
    is_esc = bool(email.is_escalation)
    is_lead = bool((email.lead_label or "").strip())
    prev_team = email.assigned_team
    prev_ai_cat = getattr(email, "ai_category", None)
    meta = {
        "wasEscalation": is_esc,
        "wasLead": is_lead,
        "previousLeadLabel": email.lead_label,
        "previousAssignedTeam": prev_team,
        "previousAiCategory": prev_ai_cat,
    }
    if is_esc or is_lead:
        email.is_escalation = False
        email.escalation_metadata = None
        email.lead_label = None
        email.lead_metadata = None
    email.assigned_team = team_val
    if hasattr(Email, "ai_category"):
        email.ai_category = team_val
    email.retagged_at = datetime.now(timezone.utc)
    email.retagged_by_email = (actor_email or "").strip().lower() or None
    email.retag_metadata = meta
    db.commit()
    db.refresh(email)


@router.patch("/emails/{email_id}/retag")
def retag_email_user_mailbox(
    email_id: str,
    body: RetagEmailBody,
    db: Session = Depends(get_db),
    current_user_email: str = Depends(get_current_user_email),
):
    """
    Assign mail to another department (ReTag). Escalation/lead flags are cleared when present.
    Mailbox owners who are not admins create a pending admin approval request instead of an immediate apply.
    """
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    owner = (getattr(email, "mailbox_owner_email", None) or "").strip().lower()
    if owner != (current_user_email or "").strip().lower():
        raise HTTPException(status_code=403, detail="You can only retag mail in your own mailbox")
    actor = (current_user_email or "").strip().lower()
    if _is_admin_actor(db, actor):
        _perform_retag(db, email, body.assigned_team, actor)
        return {"ok": True, "emailId": email_id, "assignedTeam": email.assigned_team, "mode": "applied"}

    pending = (
        db.query(RetagApprovalRequest)
        .filter(
            RetagApprovalRequest.email_id == email.id,
            RetagApprovalRequest.status == "pending",
        )
        .first()
    )
    if pending:
        pending.requested_team = (body.assigned_team or "").strip()
        pending.requested_by_email = actor
        pending.requested_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "ok": True,
            "emailId": email_id,
            "requestedTeam": pending.requested_team,
            "status": "pending",
            "mode": "request",
            "requestId": pending.id,
            "message": "Retag request updated and sent to admin approvals.",
        }

    req = RetagApprovalRequest(
        email_id=email.id,
        mailbox_owner_email=owner,
        requested_by_email=actor,
        requested_team=(body.assigned_team or "").strip(),
        status="pending",
        requested_at=datetime.now(timezone.utc),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {
        "ok": True,
        "emailId": email_id,
        "requestedTeam": req.requested_team,
        "status": "pending",
        "mode": "request",
        "requestId": req.id,
        "message": "Retag request sent to admin approvals.",
    }


@router.get("/retag-requests/mine")
def list_my_retag_requests(
    db: Session = Depends(get_db),
    current_user_email: str = Depends(get_current_user_email),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
):
    q = (
        db.query(RetagApprovalRequest)
        .filter(RetagApprovalRequest.requested_by_email == (current_user_email or "").strip().lower())
        .order_by(RetagApprovalRequest.requested_at.desc())
    )
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "requests": [
            RetagRequestOut(
                id=r.id,
                emailId=r.email_id,
                mailboxOwnerEmail=r.mailbox_owner_email,
                requestedByEmail=r.requested_by_email,
                requestedTeam=r.requested_team,
                status=r.status,
                requestedAt=r.requested_at,
                reviewedAt=r.reviewed_at,
                reviewedByEmail=r.reviewed_by_email,
                reviewNote=r.review_note,
            )
            for r in rows
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/retag/department-options")
def list_retag_department_options(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user_email),
):
    """Team/department names for retag dropdown (any signed-in user)."""
    return {"departments": sorted(_allowed_team_names(db))}


@router.get("/retagged")
def list_retagged_mails(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    from_date: str | None = Query(None, alias="from"),
    mine: bool = Query(True, description="If true, only retagged mail in the current user's mailbox"),
    current_user_email: str | None = Depends(get_current_user_email_optional),
):
    """Emails the user (or admin flow) retagged from escalation/lead into a department."""
    if mine and not current_user_email:
        raise HTTPException(status_code=401, detail="Sign in to view your ReTag list")
    try:
        if not hasattr(Email, "retagged_at"):
            return {"retagged": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.retagged_at.isnot(None))
        if mine and current_user_email and hasattr(Email, "mailbox_owner_email"):
            q = q.filter(Email.mailbox_owner_email == current_user_email)
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        total = q.count()
        rows = q.order_by(Email.retagged_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "retagged": [_email_to_item(r, include_lead_label=False, include_escalation_reasons=False) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"retagged": [], "total": 0, "page": page, "pageSize": page_size}
