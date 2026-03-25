"""Add responsibilities to project_assignments

Revision ID: 008_proj_resp
Revises: 007_team_projects
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "008_proj_resp"
down_revision: Union[str, None] = "007_team_projects"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS responsibilities TEXT NULL;"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE project_assignments DROP COLUMN IF EXISTS responsibilities;")
