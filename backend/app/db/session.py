from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from app.config import get_settings

settings = get_settings()
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Same shapes as alembic 007_team_projects; one statement per execute for driver compatibility.
_TEAM_PROJECT_DDL_STEPS = [
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
)
""",
    "CREATE INDEX IF NOT EXISTS ix_team_projects_name ON team_projects (name)",
    "CREATE INDEX IF NOT EXISTS ix_team_projects_team_id ON team_projects (team_id)",
    "CREATE INDEX IF NOT EXISTS ix_team_projects_status ON team_projects (status)",
    "CREATE INDEX IF NOT EXISTS ix_team_projects_created_by_user_id ON team_projects (created_by_user_id)",
    """
CREATE TABLE IF NOT EXISTS project_assignments (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(64) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
)
""",
    "CREATE INDEX IF NOT EXISTS ix_project_assignments_project_id ON project_assignments (project_id)",
    "CREATE INDEX IF NOT EXISTS ix_project_assignments_user_id ON project_assignments (user_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_project_assignments_unique ON project_assignments (project_id, user_id)",
]


def ensure_team_project_tables() -> None:
    """
    Ensure Admin Projects tables exist (same as alembic 007_team_projects).
    Idempotent; run on startup so deploys work without a manual alembic step.
    """
    with engine.begin() as conn:
        for step in _TEAM_PROJECT_DDL_STEPS:
            conn.execute(text(step.strip()))


def init_db():
    """Verify database connectivity; ensure optional tables that some envs skip via Alembic."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    ensure_team_project_tables()
