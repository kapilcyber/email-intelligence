"""Minutes of meeting (MOM) prompt state: persisted per mailbox in PostgreSQL."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_email
from app.db.models import MomMeetingRecord, uuid_gen
from app.db.session import get_db

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso_dt(value: str | None) -> datetime | None:
    if not value or not str(value).strip():
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _row_to_api_dict(row: MomMeetingRecord) -> dict:
    snooze_ms = None
    if row.snooze_until is not None:
        snooze_ms = int(row.snooze_until.timestamp() * 1000)
    sent_s = row.sent_at.isoformat().replace("+00:00", "Z") if row.sent_at else None
    upd_s = row.updated_at.isoformat().replace("+00:00", "Z") if row.updated_at else ""
    return {
        "eventKey": row.event_key,
        "subject": row.subject or "",
        "startISO": row.start_at.isoformat().replace("+00:00", "Z") if row.start_at else "",
        "endISO": row.end_at.isoformat().replace("+00:00", "Z") if row.end_at else "",
        "meetingType": row.meeting_type or "Unknown",
        "status": row.status,
        "snoozeUntil": snooze_ms,
        "sentAt": sent_s,
        "updatedAt": upd_s,
    }


class MomRecordUpsert(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_key: str = Field(alias="eventKey", min_length=1, max_length=16000)
    subject: str = ""
    start_iso: str = Field(default="", alias="startISO")
    end_iso: str = Field(default="", alias="endISO")
    meeting_type: str = Field(default="Unknown", alias="meetingType", max_length=64)
    status: Literal["snoozed", "sent", "skipped"]
    snooze_until: int | None = Field(default=None, alias="snoozeUntil")
    sent_at: str | None = Field(default=None, alias="sentAt")


@router.get("/records")
def list_mom_records(
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """All MOM rows for the signed-in user's mailbox, newest meeting end first."""
    user = (current_user_email or "").strip().lower()
    rows = (
        db.query(MomMeetingRecord)
        .filter(MomMeetingRecord.mailbox_owner_email == user)
        .order_by(MomMeetingRecord.end_at.desc().nullslast(), MomMeetingRecord.updated_at.desc())
        .all()
    )
    return {"records": [_row_to_api_dict(r) for r in rows]}


@router.post("/records")
def upsert_mom_record(
    body: MomRecordUpsert,
    current_user_email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    user = (current_user_email or "").strip().lower()
    if not user:
        raise HTTPException(status_code=401, detail="X-User-Email header is required")

    start_at = _parse_iso_dt(body.start_iso)
    end_at = _parse_iso_dt(body.end_iso)
    snooze_dt = None
    if body.snooze_until is not None:
        snooze_dt = datetime.fromtimestamp(body.snooze_until / 1000.0, tz=timezone.utc)
    sent_dt = _parse_iso_dt(body.sent_at) if body.sent_at else None
    if body.status == "sent" and sent_dt is None:
        sent_dt = _utcnow()

    row = (
        db.query(MomMeetingRecord)
        .filter(
            MomMeetingRecord.mailbox_owner_email == user,
            MomMeetingRecord.event_key == body.event_key,
        )
        .first()
    )
    now = _utcnow()
    if row:
        row.subject = body.subject or row.subject
        row.start_at = start_at if start_at is not None else row.start_at
        row.end_at = end_at if end_at is not None else row.end_at
        row.meeting_type = body.meeting_type or row.meeting_type
        row.status = body.status
        row.snooze_until = snooze_dt
        row.sent_at = sent_dt if body.status == "sent" else None
        row.updated_at = now
    else:
        row = MomMeetingRecord(
            id=uuid_gen(),
            mailbox_owner_email=user,
            event_key=body.event_key,
            subject=body.subject or None,
            start_at=start_at,
            end_at=end_at,
            meeting_type=body.meeting_type or "Unknown",
            status=body.status,
            snooze_until=snooze_dt,
            sent_at=sent_dt if body.status == "sent" else None,
            updated_at=now,
        )
        db.add(row)
    db.commit()
    return {"ok": True}
