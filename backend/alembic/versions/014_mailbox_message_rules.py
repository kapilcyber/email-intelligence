"""Inbox messageRules mirror (Outlook mailbox rules sync)

Revision ID: 014_mailbox_message_rules
Revises: 013_email_soft_delete
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "014_mailbox_message_rules"
down_revision: Union[str, None] = "013_email_soft_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mailbox_message_rules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("mailbox_owner_email", sa.String(length=512), nullable=False),
        sa.Column("graph_rule_id", sa.String(length=256), nullable=False),
        sa.Column("display_name", sa.String(length=512), nullable=True),
        sa.Column("rule_sequence", sa.Integer(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=True),
        sa.Column("has_error", sa.Boolean(), nullable=True),
        sa.Column("is_read_only", sa.Boolean(), nullable=True),
        sa.Column("rule_payload", JSONB(), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_mailbox_message_rules_mailbox_owner_email",
        "mailbox_message_rules",
        ["mailbox_owner_email"],
        unique=False,
    )
    op.create_index(
        "ux_mailbox_message_rules_mailbox_graph_id",
        "mailbox_message_rules",
        ["mailbox_owner_email", "graph_rule_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_mailbox_message_rules_mailbox_graph_id", table_name="mailbox_message_rules")
    op.drop_index("ix_mailbox_message_rules_mailbox_owner_email", table_name="mailbox_message_rules")
    op.drop_table("mailbox_message_rules")
