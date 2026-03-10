"""Add lead_metadata to emails for buying signals audit

Revision ID: 005_lead_metadata
Revises: 004_escalation_metadata
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "005_lead_metadata"
down_revision: Union[str, None] = "004_escalation_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'emails' AND column_name = 'lead_metadata'
            ) THEN
                ALTER TABLE emails ADD COLUMN lead_metadata JSONB NULL;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS lead_metadata")
