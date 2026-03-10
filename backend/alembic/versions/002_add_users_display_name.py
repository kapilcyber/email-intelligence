"""Add users.display_name if missing

Revision ID: 002_display_name
Revises: 001_initial
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_display_name"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add display_name to users if it doesn't exist (safe if DB was created without it)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'display_name'
            ) THEN
                ALTER TABLE users ADD COLUMN display_name VARCHAR(256) NULL;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_column("users", "display_name", schema=None)
