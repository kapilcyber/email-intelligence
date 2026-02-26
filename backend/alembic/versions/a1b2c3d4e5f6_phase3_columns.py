"""phase3 columns

Revision ID: a1b2c3d4e5f6
Revises: 4ce15f995540
Create Date: 2026-02-25

Add Phase 3 columns to emails: is_escalation, lead_label, assigned_team.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "4ce15f995540"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("emails", sa.Column("is_escalation", sa.Boolean(), nullable=True, server_default=sa.text("false")))
    op.add_column("emails", sa.Column("lead_label", sa.String(32), nullable=True))
    op.add_column("emails", sa.Column("assigned_team", sa.String(64), nullable=True))
    op.create_index(op.f("ix_emails_is_escalation"), "emails", ["is_escalation"], unique=False)
    op.create_index(op.f("ix_emails_lead_label"), "emails", ["lead_label"], unique=False)
    op.create_index(op.f("ix_emails_assigned_team"), "emails", ["assigned_team"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_emails_assigned_team"), table_name="emails")
    op.drop_index(op.f("ix_emails_lead_label"), table_name="emails")
    op.drop_index(op.f("ix_emails_is_escalation"), table_name="emails")
    op.drop_column("emails", "assigned_team")
    op.drop_column("emails", "lead_label")
    op.drop_column("emails", "is_escalation")
