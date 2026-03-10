"""Initial schema: senders, emails, attachments, teams, users

Revision ID: 001_initial
Revises:
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "senders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(512), nullable=False),
        sa.Column("display_name", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_senders_email", "senders", ["email"], unique=True)

    op.create_table(
        "emails",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(1024), nullable=False),
        sa.Column("graph_id", sa.String(512), nullable=True),
        sa.Column("conversation_id", sa.String(512), nullable=True),
        sa.Column("subject", sa.String(1024), nullable=True),
        sa.Column("body_preview", sa.Text(), nullable=True),
        sa.Column("body_content", sa.Text(), nullable=True),
        sa.Column("body_content_type", sa.String(32), nullable=True),
        sa.Column("sender_email", sa.String(512), nullable=False),
        sa.Column("sender_id", sa.String(36), sa.ForeignKey("senders.id"), nullable=True),
        sa.Column("sender_display_name", sa.String(512), nullable=True),
        sa.Column("cc_recipients", JSONB, nullable=True),
        sa.Column("to_recipients", JSONB, nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("folder_id", sa.String(512), nullable=True),
        sa.Column("folder_name", sa.String(256), nullable=True),
        sa.Column("mailbox_owner_email", sa.String(512), nullable=True),
        sa.Column("status", sa.String(32), server_default=sa.text("'stored'"), nullable=True),
        sa.Column("raw_payload", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("processing_status", sa.String(32), server_default=sa.text("'ingested'"), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_category", sa.String(64), nullable=True),
        sa.Column("ai_priority_score", sa.Float(), nullable=True),
        sa.Column("ai_priority_label", sa.String(32), nullable=True),
        sa.Column("ai_suggested_replies", JSONB, nullable=True),
        sa.Column("ai_processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_status", sa.String(32), server_default=sa.text("'pending'"), nullable=True),
        sa.Column("ai_error_message", sa.Text(), nullable=True),
        sa.Column("ai_confidence_score", sa.Float(), nullable=True),
        sa.Column("is_escalation", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("assigned_team", sa.String(64), nullable=True),
        sa.Column("lead_label", sa.String(32), nullable=True),
    )
    op.create_index("ix_emails_message_id", "emails", ["message_id"], unique=True)
    op.create_index("ix_emails_graph_id", "emails", ["graph_id"], unique=True)
    op.create_index("ix_emails_sender_email", "emails", ["sender_email"], unique=False)
    op.create_index("ix_emails_received_at", "emails", ["received_at"], unique=False)
    op.create_index("ix_emails_mailbox_owner_email", "emails", ["mailbox_owner_email"], unique=False)
    op.create_index("ix_emails_processing_status", "emails", ["processing_status"], unique=False)
    op.create_index("ix_emails_ai_category", "emails", ["ai_category"], unique=False)
    op.create_index("ix_emails_ai_priority_label", "emails", ["ai_priority_label"], unique=False)
    op.create_index("ix_emails_ai_status", "emails", ["ai_status"], unique=False)
    op.create_index("ix_emails_is_escalation", "emails", ["is_escalation"], unique=False)
    op.create_index("ix_emails_assigned_team", "emails", ["assigned_team"], unique=False)
    op.create_index("ix_emails_lead_label", "emails", ["lead_label"], unique=False)

    op.create_table(
        "attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email_id", sa.String(36), sa.ForeignKey("emails.id", ondelete="CASCADE"), nullable=False),
        sa.Column("graph_attachment_id", sa.String(512), nullable=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("content_type", sa.String(256), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("is_inline", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_attachments_email_id", "attachments", ["email_id"], unique=False)

    op.create_table(
        "teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("slug", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_teams_name", "teams", ["name"], unique=True)
    op.create_index("ix_teams_slug", "teams", ["slug"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(512), nullable=False),
        sa.Column("display_name", sa.String(256), nullable=True),
        sa.Column("role", sa.String(32), server_default=sa.text("'Member'"), nullable=False),
        sa.Column("team_id", sa.String(36), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("manager_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_team_lead", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.create_index("ix_users_team_id", "users", ["team_id"], unique=False)
    op.create_index("ix_users_manager_id", "users", ["manager_id"], unique=False)


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("teams")
    op.drop_table("attachments")
    op.drop_table("emails")
    op.drop_table("senders")
