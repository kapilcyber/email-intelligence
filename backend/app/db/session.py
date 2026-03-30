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
    "ALTER TABLE team_projects ADD COLUMN IF NOT EXISTS tracker_schedule_days JSONB NULL",
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


_USER_ACTIVITY_DDL_STEPS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role_promoted_at TIMESTAMP WITH TIME ZONE NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role_promotion_dismissed_at TIMESTAMP WITH TIME ZONE NULL",
    "CREATE INDEX IF NOT EXISTS ix_users_last_login_at ON users (last_login_at)",
]


def ensure_user_activity_columns() -> None:
    with engine.begin() as conn:
        for step in _USER_ACTIVITY_DDL_STEPS:
            conn.execute(text(step.strip()))


_USER_LOGIN_EVENTS_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS user_login_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(512) NOT NULL,
    login_at TIMESTAMP WITH TIME ZONE NOT NULL,
    logout_at TIMESTAMP WITH TIME ZONE NULL,
    is_logged_in BOOLEAN NOT NULL DEFAULT true,
    login_source VARCHAR(32) NOT NULL
)
""".strip()


def migrate_user_login_events_session_schema() -> None:
    """Drop legacy append-only event columns (after truncating), ensure session columns + indexes."""
    with engine.begin() as conn:
        exists = conn.execute(
            text(
                "SELECT EXISTS (SELECT FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'user_login_events')"
            )
        ).scalar()
        if not exists:
            return

        legacy = conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' "
                "AND table_name = 'user_login_events' AND column_name = 'occurred_at' LIMIT 1"
            )
        ).fetchone()

        if legacy:
            conn.execute(text("TRUNCATE TABLE user_login_events"))
            conn.execute(text("DROP INDEX IF EXISTS ix_user_login_events_occurred_at"))
            conn.execute(text("DROP INDEX IF EXISTS ix_user_login_events_last_logout_at"))
            conn.execute(text("DROP INDEX IF EXISTS ix_user_login_events_user_occurred"))
            for col in ("occurred_at", "source", "last_logout_at"):
                conn.execute(text(f"ALTER TABLE user_login_events DROP COLUMN IF EXISTS {col}"))

        conn.execute(text("ALTER TABLE user_login_events ADD COLUMN IF NOT EXISTS login_at TIMESTAMP WITH TIME ZONE"))
        conn.execute(text("ALTER TABLE user_login_events ADD COLUMN IF NOT EXISTS logout_at TIMESTAMP WITH TIME ZONE NULL"))
        conn.execute(text("ALTER TABLE user_login_events ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN"))
        conn.execute(text("ALTER TABLE user_login_events ADD COLUMN IF NOT EXISTS login_source VARCHAR(32)"))

        conn.execute(
            text("UPDATE user_login_events SET login_at = NOW() AT TIME ZONE 'utc' WHERE login_at IS NULL")
        )
        conn.execute(text("UPDATE user_login_events SET is_logged_in = true WHERE is_logged_in IS NULL"))
        conn.execute(text("UPDATE user_login_events SET login_source = 'session' WHERE login_source IS NULL"))

        conn.execute(text("ALTER TABLE user_login_events ALTER COLUMN login_at SET NOT NULL"))
        conn.execute(text("ALTER TABLE user_login_events ALTER COLUMN is_logged_in SET NOT NULL"))
        conn.execute(text("ALTER TABLE user_login_events ALTER COLUMN login_source SET NOT NULL"))
        conn.execute(text("ALTER TABLE user_login_events ALTER COLUMN is_logged_in SET DEFAULT true"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_login_events_user_id ON user_login_events (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_login_events_email ON user_login_events (email)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_login_events_login_at ON user_login_events (login_at DESC)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_user_login_events_user_login ON user_login_events (user_id, login_at DESC)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_user_login_events_active_user ON user_login_events (user_id) WHERE is_logged_in = true"
            )
        )

        conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS last_logout_at"))


def ensure_user_login_events_table() -> None:
    with engine.begin() as conn:
        conn.execute(text(_USER_LOGIN_EVENTS_CREATE_SQL))
    migrate_user_login_events_session_schema()


_RETAG_APPROVALS_DDL_STEPS = [
    """
CREATE TABLE IF NOT EXISTS retag_approval_requests (
    id VARCHAR(36) PRIMARY KEY,
    email_id VARCHAR(36) NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    mailbox_owner_email VARCHAR(512) NOT NULL,
    requested_by_email VARCHAR(512) NOT NULL,
    requested_team VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    reviewed_at TIMESTAMP WITH TIME ZONE NULL,
    reviewed_by_email VARCHAR(512) NULL,
    review_note TEXT NULL
)
""".strip(),
    "CREATE INDEX IF NOT EXISTS ix_retag_req_email_id ON retag_approval_requests (email_id)",
    "CREATE INDEX IF NOT EXISTS ix_retag_req_mailbox_owner_email ON retag_approval_requests (mailbox_owner_email)",
    "CREATE INDEX IF NOT EXISTS ix_retag_req_requested_by_email ON retag_approval_requests (requested_by_email)",
    "CREATE INDEX IF NOT EXISTS ix_retag_req_requested_team ON retag_approval_requests (requested_team)",
    "CREATE INDEX IF NOT EXISTS ix_retag_req_status ON retag_approval_requests (status)",
    "CREATE INDEX IF NOT EXISTS ix_retag_req_requested_at ON retag_approval_requests (requested_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_retag_req_pending_email ON retag_approval_requests (email_id, status)",
]


def ensure_retag_approval_requests_table() -> None:
    with engine.begin() as conn:
        for step in _RETAG_APPROVALS_DDL_STEPS:
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
    ensure_user_activity_columns()
    ensure_user_login_events_table()
    ensure_retag_approval_requests_table()
