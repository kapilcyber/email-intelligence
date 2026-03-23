"""
Phase 3 APIs: escalations, leads, routing (assign team).
"""
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.db.models import Email, EscalationThread, Team
from app.api.deps import get_current_user_email_optional

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
