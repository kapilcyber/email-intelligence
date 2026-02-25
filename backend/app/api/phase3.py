"""
Phase 3 APIs: escalations, leads, routing (assign team).
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.db.models import Email

router = APIRouter()


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


def _email_to_item(r: Email) -> dict:
    return {
        "id": r.id,
        "messageId": r.message_id,
        "subject": r.subject,
        "sender": r.sender_email,
        "receivedAt": r.received_at,
        "assignedTeam": getattr(r, "assigned_team", None),
        "priorityLabel": getattr(r, "ai_priority_label", None),
        "summary": getattr(r, "ai_summary", None),
    }


@router.get("/escalations")
def list_escalations(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    from_date: str | None = Query(None, alias="from"),
):
    """List emails flagged as escalations (is_escalation=true)."""
    try:
        if not hasattr(Email, "is_escalation"):
            return {"escalations": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.is_escalation == True)
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                q = q.filter(Email.received_at >= dt)
            except ValueError:
                pass
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "escalations": [_email_to_item(r) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"escalations": [], "total": 0, "page": page, "pageSize": page_size}


@router.get("/leads")
def list_leads(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    label: str | None = Query(None, description="Filter by lead label: Hot, Warm, Cold"),
):
    """List emails with a lead label (Hot/Warm/Cold)."""
    try:
        if not hasattr(Email, "lead_label"):
            return {"leads": [], "total": 0, "page": page, "pageSize": page_size}
        q = db.query(Email).filter(Email.lead_label.isnot(None))
        if label and label.strip():
            q = q.filter(Email.lead_label == label.strip())
        total = q.count()
        rows = q.order_by(Email.received_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {
            "leads": [_email_to_item(r) for r in rows],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }
    except (OperationalError, Exception):
        return {"leads": [], "total": 0, "page": page, "pageSize": page_size}


@router.patch("/emails/{email_id}/assign")
def assign_team(
    email_id: str,
    team: str = Query(..., description="Team to assign: Sales, Accounts, HR, Tech, General"),
    db: Session = Depends(get_db),
):
    """Manually assign an email to a team (overrides routing)."""
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Email not found")
    if not hasattr(Email, "assigned_team"):
        from fastapi import HTTPException
        raise HTTPException(status_code=501, detail="assigned_team not available")
    email.assigned_team = team.strip() if team else None
    db.commit()
    return {"ok": True, "emailId": email_id, "assignedTeam": email.assigned_team}
