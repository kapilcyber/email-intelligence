"""Add escalation_metadata to emails for audit trail of escalation reasons

Revision ID: 004_escalation_metadata
Revises: 003_users_columns
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "004_escalation_metadata"
down_revision: Union[str, None] = "2b778d9d1c5c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'emails' AND column_name = 'escalation_metadata'
            ) THEN
                ALTER TABLE emails ADD COLUMN escalation_metadata JSONB NULL;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS escalation_metadata")
