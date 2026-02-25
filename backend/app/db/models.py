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
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    emails = relationship("Email", back_populates="sender_rel", foreign_keys="Email.sender_id")


class Email(Base):
    __tablename__ = "emails"

    id = Column(String(36), primary_key=True, default=uuid_gen)
    message_id = Column(String(1024), unique=True, nullable=False, index=True)
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
