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
    "ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS responsibilities TEXT NULL",
    "ALTER TABLE team_projects ADD COLUMN IF NOT EXISTS project_lead_user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_team_projects_project_lead_user_id ON team_projects (project_lead_user_id)",
    "ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS reports_to_user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_project_assignments_reports_to_user_id ON project_assignments (reports_to_user_id)",
]

_EMAIL_BCC_DDL_STEPS = [
    "ALTER TABLE emails ADD COLUMN IF NOT EXISTS bcc_recipients JSONB NULL",
]

_EMAIL_MESSAGE_PER_MAILBOX_DDL_STEPS = [
    # Legacy unique-by-message index/constraint blocks same mail syncing across different mailboxes.
    "DROP INDEX IF EXISTS ix_emails_message_id",
    "DROP INDEX IF EXISTS emails_message_id_key",
    "ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_message_id_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_emails_mailbox_message_id ON emails (mailbox_owner_email, message_id)",
    "CREATE INDEX IF NOT EXISTS ix_emails_message_id ON emails (message_id)",
]


def ensure_email_bcc_column() -> None:
    """Idempotent Bcc storage for thread exports and detail views."""
    with engine.begin() as conn:
        for step in _EMAIL_BCC_DDL_STEPS:
            conn.execute(text(step.strip()))


def ensure_email_message_per_mailbox_index() -> None:
    """Allow same Outlook message-id across different mailbox owners."""
    with engine.begin() as conn:
        for step in _EMAIL_MESSAGE_PER_MAILBOX_DDL_STEPS:
            conn.execute(text(step.strip()))


_MOM_MEETING_RECORDS_DDL_STEPS = [
    """
CREATE TABLE IF NOT EXISTS mom_meeting_records (
    id VARCHAR(36) PRIMARY KEY,
    mailbox_owner_email VARCHAR(512) NOT NULL,
    event_key TEXT NOT NULL,
    subject TEXT NULL,
    start_at TIMESTAMP WITH TIME ZONE NULL,
    end_at TIMESTAMP WITH TIME ZONE NULL,
    meeting_type VARCHAR(64) NOT NULL DEFAULT 'Unknown',
    status VARCHAR(32) NOT NULL,
    snooze_until TIMESTAMP WITH TIME ZONE NULL,
    sent_at TIMESTAMP WITH TIME ZONE NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
)
""".strip(),
    "CREATE INDEX IF NOT EXISTS ix_mom_meeting_records_mailbox ON mom_meeting_records (mailbox_owner_email)",
    "CREATE INDEX IF NOT EXISTS ix_mom_meeting_records_end_at ON mom_meeting_records (end_at)",
    "CREATE INDEX IF NOT EXISTS ix_mom_meeting_records_status ON mom_meeting_records (status)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_mom_mailbox_event ON mom_meeting_records (mailbox_owner_email, event_key)",
]


_EMAIL_RETAG_DDL_STEPS = [
    "ALTER TABLE emails ADD COLUMN IF NOT EXISTS retagged_at TIMESTAMP WITH TIME ZONE NULL",
    "ALTER TABLE emails ADD COLUMN IF NOT EXISTS retagged_by_email VARCHAR(512) NULL",
    "ALTER TABLE emails ADD COLUMN IF NOT EXISTS retag_metadata JSONB NULL",
    "CREATE INDEX IF NOT EXISTS ix_emails_retagged_at ON emails (retagged_at)",
    "CREATE INDEX IF NOT EXISTS ix_emails_retagged_by_email ON emails (retagged_by_email)",
]


def ensure_team_project_tables() -> None:
    """
    Ensure Admin Projects tables exist (same as alembic 007_team_projects).
    Idempotent; run on startup so deploys work without a manual alembic step.
    """
    with engine.begin() as conn:
        for step in _TEAM_PROJECT_DDL_STEPS:
            conn.execute(text(step.strip()))


def ensure_email_retag_columns() -> None:
    """Idempotent retag columns on emails (escalation/lead retag + ReTag view)."""
    with engine.begin() as conn:
        for step in _EMAIL_RETAG_DDL_STEPS:
            conn.execute(text(step.strip()))


def ensure_mom_meeting_records_table() -> None:
    """Idempotent MOM (minutes of meeting) records per mailbox."""
    with engine.begin() as conn:
        for step in _MOM_MEETING_RECORDS_DDL_STEPS:
            conn.execute(text(step.strip()))


def init_db():
    """Verify database connectivity; ensure optional tables that some envs skip via Alembic."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    ensure_team_project_tables()
    ensure_email_bcc_column()
    ensure_email_message_per_mailbox_index()
    ensure_email_retag_columns()
    ensure_mom_meeting_records_table()
