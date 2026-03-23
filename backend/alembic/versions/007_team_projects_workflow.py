"""Add team project workflow tables

Revision ID: 007_team_projects
Revises: 006_daily_esc_trust
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "007_team_projects"
down_revision: Union[str, None] = "006_daily_esc_trust"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS team_projects (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(256) NOT NULL,
            team_id VARCHAR(36) NULL REFERENCES teams(id) ON DELETE SET NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            structure JSONB NULL,
            created_by_user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
        );
        CREATE INDEX IF NOT EXISTS ix_team_projects_name ON team_projects (name);
        CREATE INDEX IF NOT EXISTS ix_team_projects_team_id ON team_projects (team_id);
        CREATE INDEX IF NOT EXISTS ix_team_projects_status ON team_projects (status);
        CREATE INDEX IF NOT EXISTS ix_team_projects_created_by_user_id ON team_projects (created_by_user_id);
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_assignments (
            id VARCHAR(36) PRIMARY KEY,
            project_id VARCHAR(36) NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
            user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(64) NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
        );
        CREATE INDEX IF NOT EXISTS ix_project_assignments_project_id ON project_assignments (project_id);
        CREATE INDEX IF NOT EXISTS ix_project_assignments_user_id ON project_assignments (user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS ix_project_assignments_unique ON project_assignments (project_id, user_id);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS project_assignments;")
    op.execute("DROP TABLE IF EXISTS team_projects;")
