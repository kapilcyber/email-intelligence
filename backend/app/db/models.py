from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey, Integer, Index, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
import uuid

from app.db.session import Base


def uuid_gen():
    return str(uuid.uuid4())


class Sender(Base):
    __tablename__ = "senders"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    email = Column(String(512), unique=True, nullable=False, index=True)
    display_name = Column(String(512), nullable=True)
    trust_score = Column(Float, nullable=True)  # 0.0–1.0; lower = more likely spam/phishing from this sender
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    emails = relationship("Email", back_populates="sender_rel", foreign_keys="Email.sender_id")


class Email(Base):
    __tablename__ = "emails"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    message_id = Column(String(1024), nullable=False, index=True)
    graph_id = Column(String(512), unique=True, nullable=True, index=True)
    conversation_id = Column(String(512), nullable=True, index=True)

    subject = Column(String(1024), nullable=True)
    body_preview = Column(Text, nullable=True)
    body_content = Column(Text, nullable=True)
    body_content_type = Column(String(32), nullable=True)

    sender_email = Column(String(512), nullable=False, index=True)
    sender_id = Column(String(36), ForeignKey("senders.id"), nullable=True)
    sender_display_name = Column(String(512), nullable=True)
    cc_recipients = Column(JSONB, nullable=True)
    bcc_recipients = Column(JSONB, nullable=True)
    to_recipients = Column(JSONB, nullable=True)

    received_at = Column(DateTime(timezone=True), nullable=False, index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    is_read = Column(Boolean, default=False)
    folder_id = Column(String(512), nullable=True, index=True)
    folder_name = Column(String(256), nullable=True)

    # Per-user dashboard: mailbox this email belongs to (user's Outlook email or Azure AD UPN)
    mailbox_owner_email = Column(String(512), nullable=True, index=True)

    status = Column(String(32), default="stored")  # stored | failed
    raw_payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Processing state: received -> ingested -> classified | failed
    processing_status = Column(String(32), default="ingested", index=True)  # received | ingested | classified | failed

    # Phase 2 — AI classification (OpenAI)
    ai_summary = Column(Text, nullable=True)
    ai_category = Column(String(64), nullable=True, index=True)
    ai_priority_score = Column(Float, nullable=True)
    ai_priority_label = Column(String(32), nullable=True, index=True)  # Critical | High | Medium | Low | Spam
    ai_suggested_replies = Column(JSONB, nullable=True)  # list of strings
    ai_processed_at = Column(DateTime(timezone=True), nullable=True)
    ai_status = Column(String(32), default="pending", index=True)  # pending | completed | failed
    ai_error_message = Column(Text, nullable=True)
    ai_confidence_score = Column(Float, nullable=True)  # optional 0-1

    # Phase 3 — escalation, leads, routing
    is_escalation = Column(Boolean, default=False, index=True)
    escalation_metadata = Column(JSONB, nullable=True)  # {"reasons": ["priority_high", "keywords", ...]} for audit
    assigned_team = Column(String(64), nullable=True, index=True)  # Tech, Networking, Cybersecurity, Sales, Accounts, Data & AI, General
    lead_label = Column(String(32), nullable=True, index=True)  # Hot, Warm, Cold
    lead_metadata = Column(JSONB, nullable=True)  # {"buying_signals": ["demo_request", "budget_discussion", ...]}

    # User/admin retag: removed from escalation/lead, routed to a department; AI re-classify won't override
    retagged_at = Column(DateTime(timezone=True), nullable=True, index=True)
    retagged_by_email = Column(String(512), nullable=True, index=True)
    retag_metadata = Column(JSONB, nullable=True)  # wasEscalation, wasLead, previousLeadLabel, previousAssignedTeam

    sender_rel = relationship("Sender", back_populates="emails", foreign_keys=[sender_id])
    attachments = relationship("Attachment", back_populates="email", cascade="all, delete-orphan")
    # Indexes are created via index=True on columns above; no duplicate __table_args__ indexes


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    email_id = Column(String(36), ForeignKey("emails.id", ondelete="CASCADE"), nullable=False)
    graph_attachment_id = Column(String(512), nullable=True)
    name = Column(String(512), nullable=False)
    content_type = Column(String(256), nullable=True)
    size = Column(Integer, nullable=True)
    is_inline = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    email = relationship("Email", back_populates="attachments")

    __table_args__ = (Index("ix_attachments_email_id", "email_id"),)


class Team(Base):
    """Phase 4: Teams (Tech, Networking, Cybersecurity, Sales, Accounts, Data & AI)."""
    __tablename__ = "teams"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    name = Column(String(128), unique=True, nullable=False, index=True)
    slug = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    members = relationship("User", back_populates="team", foreign_keys="User.team_id")


class User(Base):
    """Phase 4: Users/employees with role, team, and reporting (manager)."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    email = Column(String(512), unique=True, nullable=False, index=True)
    display_name = Column(String(256), nullable=True)
    role = Column(String(32), nullable=False, default="Member", index=True)  # Admin | Manager | Member
    team_id = Column(String(36), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    manager_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_team_lead = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("Team", back_populates="members", foreign_keys=[team_id])
    manager = relationship("User", remote_side=[id], foreign_keys=[manager_id])
    reports = relationship("User", back_populates="manager", foreign_keys=[manager_id])


class DailySummary(Base):
    """End-of-day summary: total emails, critical, escalations, leads, pending, unopened important."""
    __tablename__ = "daily_summaries"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    summary_date = Column(DateTime(timezone=True), nullable=False, index=True)  # date at midnight UTC
    mailbox_owner_email = Column(String(512), nullable=True, index=True)  # null = global/aggregate
    summary = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (Index("ix_daily_summaries_date_mailbox", "summary_date", "mailbox_owner_email", unique=True),)


class EscalationThread(Base):
    """Tracks conversations that have at least one escalation (continuous escalation threads)."""
    __tablename__ = "escalation_threads"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    conversation_id = Column(String(512), unique=True, nullable=False, index=True)
    first_escalated_at = Column(DateTime(timezone=True), nullable=False)
    last_escalation_at = Column(DateTime(timezone=True), nullable=False)
    escalation_count = Column(Integer, default=1)
    last_email_id = Column(String(36), ForeignKey("emails.id", ondelete="SET NULL"), nullable=True)


class TeamProject(Base):
    """Admin-managed projects per team with workflow structure metadata."""
    __tablename__ = "team_projects"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    name = Column(String(256), nullable=False, index=True)
    team_id = Column(String(36), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="running", index=True)  # running | new | planned | completed
    structure = Column(JSONB, nullable=True)  # {"phases": [...], "notes": "..."}
    created_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # Optional project-only lead (not org team lead). Must be among assigned users.
    project_lead_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("Team", foreign_keys=[team_id])
    assignments = relationship("ProjectAssignment", back_populates="project", cascade="all, delete-orphan")


class ProjectAssignment(Base):
    """User assignments to a team project."""
    __tablename__ = "project_assignments"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    project_id = Column(String(36), ForeignKey("team_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(64), nullable=True)  # project-specific role (e.g. Tech lead)
    responsibilities = Column(Text, nullable=True)  # what they do on this project
    # Project-internal reporting (not org manager). Must be another assignee or null.
    reports_to_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    project = relationship("TeamProject", back_populates="assignments", foreign_keys=[project_id])
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (Index("ix_project_assignments_unique", "project_id", "user_id", unique=True),)


class MomMeetingRecord(Base):
    """Per-mailbox minutes-of-meeting (MOM) prompt state for calendar meetings."""

    __tablename__ = "mom_meeting_records"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    mailbox_owner_email = Column(String(512), nullable=False, index=True)
    event_key = Column(Text, nullable=False)
    subject = Column(Text, nullable=True)
    start_at = Column(DateTime(timezone=True), nullable=True)
    end_at = Column(DateTime(timezone=True), nullable=True, index=True)
    meeting_type = Column(String(64), nullable=False, default="Unknown")
    status = Column(String(32), nullable=False, index=True)  # snoozed | sent | skipped
    snooze_until = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index("ux_mom_mailbox_event", "mailbox_owner_email", "event_key", unique=True),)
