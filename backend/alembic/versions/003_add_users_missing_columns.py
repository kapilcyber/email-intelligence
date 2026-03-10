"""Add all missing users table columns to match User model

Revision ID: 003_users_columns
Revises: 002_display_name
Create Date: 2026-03-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_users_columns"
down_revision: Union[str, None] = "002_display_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add each User model column if missing (safe for existing DBs)
    columns_sql = [
        ("display_name", "ALTER TABLE users ADD COLUMN display_name VARCHAR(256) NULL"),
        ("role", "ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'Member'"),
        ("team_id", "ALTER TABLE users ADD COLUMN team_id VARCHAR(36) NULL REFERENCES teams(id) ON DELETE SET NULL"),
        ("manager_id", "ALTER TABLE users ADD COLUMN manager_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL"),
        ("is_team_lead", "ALTER TABLE users ADD COLUMN is_team_lead BOOLEAN NOT NULL DEFAULT false"),
        ("created_at", "ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now()"),
        ("updated_at", "ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()"),
    ]
    for col_name, alter_sql in columns_sql:
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = '{col_name}'
                ) THEN
                    EXECUTE '{alter_sql.replace("'", "''")}';
                END IF;
            END $$;
            """
        )

    # Create indexes if they don't exist
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_role ON users (role)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_team_id ON users (team_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_manager_id ON users (manager_id)")


def downgrade() -> None:
    op.drop_index("ix_users_manager_id", table_name="users", if_exists=True)
    op.drop_index("ix_users_team_id", table_name="users", if_exists=True)
    op.drop_index("ix_users_role", table_name="users", if_exists=True)
    for col in ("updated_at", "created_at", "is_team_lead", "manager_id", "team_id", "role", "display_name"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}")
