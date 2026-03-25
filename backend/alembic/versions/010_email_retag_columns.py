"""Retag columns on emails (escalation/lead retag audit + ReTag list)

Revision ID: 010_email_retag
Revises: 009_proj_lead_reports
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "010_email_retag"
down_revision: Union[str, None] = "009_proj_lead_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE emails ADD COLUMN IF NOT EXISTS retagged_at TIMESTAMP WITH TIME ZONE NULL;")
    op.execute("ALTER TABLE emails ADD COLUMN IF NOT EXISTS retagged_by_email VARCHAR(512) NULL;")
    op.execute("ALTER TABLE emails ADD COLUMN IF NOT EXISTS retag_metadata JSONB NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_retagged_at ON emails (retagged_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_retagged_by_email ON emails (retagged_by_email);")


def downgrade() -> None:
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS retag_metadata;")
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS retagged_by_email;")
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS retagged_at;")
