"""Project lead on team_projects; reports_to on project_assignments

Revision ID: 009_proj_lead_reports
Revises: 008_proj_resp
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "009_proj_lead_reports"
down_revision: Union[str, None] = "008_proj_resp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE team_projects ADD COLUMN IF NOT EXISTS project_lead_user_id VARCHAR(36) NULL "
        "REFERENCES users(id) ON DELETE SET NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_team_projects_project_lead_user_id ON team_projects (project_lead_user_id);"
    )
    op.execute(
        "ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS reports_to_user_id VARCHAR(36) NULL "
        "REFERENCES users(id) ON DELETE SET NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_project_assignments_reports_to_user_id ON project_assignments (reports_to_user_id);"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE project_assignments DROP COLUMN IF EXISTS reports_to_user_id;")
    op.execute("ALTER TABLE team_projects DROP COLUMN IF EXISTS project_lead_user_id;")
