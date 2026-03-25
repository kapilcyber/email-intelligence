"""bcc_recipients on emails (thread export / recipients)

Revision ID: 011_email_bcc
Revises: 010_email_retag
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "011_email_bcc"
down_revision: Union[str, None] = "010_email_retag"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE emails ADD COLUMN IF NOT EXISTS bcc_recipients JSONB NULL;")


def downgrade() -> None:
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS bcc_recipients;")
