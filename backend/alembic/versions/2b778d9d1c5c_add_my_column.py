"""add_my_column

Revision ID: 2b778d9d1c5c
Revises: 003_users_columns
Create Date: 2026-03-03 11:18:39.931717
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "2b778d9d1c5c"
down_revision: Union[str, None] = "003_users_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    result = bind.execute(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = :table_name
              AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.first() is not None


def upgrade() -> None:
    bind = op.get_bind()

    if _column_exists(bind, "emails", "lead_label"):
        op.alter_column(
            "emails",
            "lead_label",
            existing_type=sa.VARCHAR(length=16),
            type_=sa.String(length=32),
            existing_nullable=True,
        )

    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_ai_category ON emails (ai_category)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_ai_priority_label ON emails (ai_priority_label)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_assigned_team ON emails (assigned_team)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_is_escalation ON emails (is_escalation)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_lead_label ON emails (lead_label)")

    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS is_spam")
    op.execute("ALTER TABLE emails DROP COLUMN IF EXISTS escalation_metadata")
    op.execute("ALTER TABLE senders DROP COLUMN IF EXISTS importance_weight")
    op.execute("ALTER TABLE senders DROP COLUMN IF EXISTS trust_score")

    if _column_exists(bind, "users", "is_team_lead"):
        op.alter_column(
            "users",
            "is_team_lead",
            existing_type=sa.BOOLEAN(),
            nullable=True,
            existing_server_default=sa.text("false"),
        )

    op.execute("DROP INDEX IF EXISTS ix_users_microsoft_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS microsoft_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")


def downgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.VARCHAR(length=256), nullable=True))
    op.add_column("users", sa.Column("microsoft_id", sa.VARCHAR(length=256), nullable=True))
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_microsoft_id ON users (microsoft_id)")

    op.alter_column(
        "users",
        "is_team_lead",
        existing_type=sa.BOOLEAN(),
        nullable=False,
        existing_server_default=sa.text("false"),
    )

    op.add_column("senders", sa.Column("trust_score", sa.DOUBLE_PRECISION(precision=53), nullable=True))
    op.add_column("senders", sa.Column("importance_weight", sa.DOUBLE_PRECISION(precision=53), nullable=True))

    op.add_column("emails", sa.Column("escalation_metadata", sa.JSON(), nullable=True))
    op.add_column("emails", sa.Column("is_spam", sa.BOOLEAN(), server_default=sa.text("false"), nullable=True))

    op.execute("DROP INDEX IF EXISTS ix_emails_lead_label")
    op.execute("DROP INDEX IF EXISTS ix_emails_is_escalation")
    op.execute("DROP INDEX IF EXISTS ix_emails_assigned_team")
    op.execute("DROP INDEX IF EXISTS ix_emails_ai_priority_label")
    op.execute("DROP INDEX IF EXISTS ix_emails_ai_category")

    op.alter_column(
        "emails",
        "lead_label",
        existing_type=sa.String(length=32),
        type_=sa.VARCHAR(length=16),
        existing_nullable=True,
    )
