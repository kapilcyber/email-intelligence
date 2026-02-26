"""initial

Revision ID: 4ce15f995540
Revises:
Create Date: 2026-02-25 17:46:15.529979

Creates senders, emails, attachments tables as defined in app.db.models.
For an existing DB that already has these tables, run: alembic stamp head
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "4ce15f995540"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "senders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(512), nullable=False, index=True),
        sa.Column("display_name", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_senders_email"), "senders", ["email"], unique=True)

    op.create_table(
        "emails",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(1024), nullable=False, index=True),
        sa.Column("graph_id", sa.String(512), nullable=True, index=True),
        sa.Column("conversation_id", sa.String(512), nullable=True, index=True),
        sa.Column("subject", sa.String(1024), nullable=True),
        sa.Column("body_preview", sa.Text(), nullable=True),
        sa.Column("body_content", sa.Text(), nullable=True),
        sa.Column("body_content_type", sa.String(32), nullable=True),
        sa.Column("sender_email", sa.String(512), nullable=False, index=True),
        sa.Column("sender_id", sa.String(36), sa.ForeignKey("senders.id"), nullable=True),
        sa.Column("sender_display_name", sa.String(512), nullable=True),
        sa.Column("cc_recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("to_recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        sa.Column("folder_id", sa.String(512), nullable=True, index=True),
        sa.Column("folder_name", sa.String(256), nullable=True),
        sa.Column("status", sa.String(32), nullable=True, server_default="stored"),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_status", sa.String(32), nullable=True, server_default="ingested", index=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_category", sa.String(64), nullable=True, index=True),
        sa.Column("ai_priority_score", sa.Float(), nullable=True),
        sa.Column("ai_priority_label", sa.String(32), nullable=True, index=True),
        sa.Column("ai_suggested_replies", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ai_processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_status", sa.String(32), nullable=True, server_default="pending", index=True),
        sa.Column("ai_error_message", sa.Text(), nullable=True),
        sa.Column("ai_confidence_score", sa.Float(), nullable=True),
    )
    op.create_index(op.f("ix_emails_message_id"), "emails", ["message_id"], unique=True)
    op.create_index(op.f("ix_emails_graph_id"), "emails", ["graph_id"], unique=True)

    op.create_table(
        "attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email_id", sa.String(36), sa.ForeignKey("emails.id", ondelete="CASCADE"), nullable=False),
        sa.Column("graph_attachment_id", sa.String(512), nullable=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("content_type", sa.String(256), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("is_inline", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_attachments_email_id", "attachments", ["email_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attachments_email_id", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index(op.f("ix_emails_graph_id"), table_name="emails")
    op.drop_index(op.f("ix_emails_message_id"), table_name="emails")
    op.drop_table("emails")
    op.drop_index(op.f("ix_senders_email"), table_name="senders")
    op.drop_table("senders")
