"""Daily summaries, escalation threads, sender trust_score

Revision ID: 006_daily_esc_trust
Revises: 005_lead_metadata
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "006_daily_esc_trust"
down_revision: Union[str, None] = "005_lead_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sender trust_score
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'senders' AND column_name = 'trust_score'
            ) THEN
                ALTER TABLE senders ADD COLUMN trust_score DOUBLE PRECISION NULL;
            END IF;
        END $$;
    """)
    # daily_summaries table
    op.execute("""
        CREATE TABLE IF NOT EXISTS daily_summaries (
            id VARCHAR(36) PRIMARY KEY,
            summary_date TIMESTAMP WITH TIME ZONE NOT NULL,
            mailbox_owner_email VARCHAR(512),
            summary JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_summaries_summary_date ON daily_summaries (summary_date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_summaries_mailbox ON daily_summaries (mailbox_owner_email);")
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_daily_summaries_date_mailbox
        ON daily_summaries (summary_date, mailbox_owner_email);
    """)
    # escalation_threads table
    op.execute("""
        CREATE TABLE IF NOT EXISTS escalation_threads (
            id VARCHAR(36) PRIMARY KEY,
            conversation_id VARCHAR(512) NOT NULL UNIQUE,
            first_escalated_at TIMESTAMP WITH TIME ZONE NOT NULL,
            last_escalation_at TIMESTAMP WITH TIME ZONE NOT NULL,
            escalation_count INTEGER DEFAULT 1,
            last_email_id VARCHAR(36) REFERENCES emails(id) ON DELETE SET NULL
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_escalation_threads_conversation_id ON escalation_threads (conversation_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS escalation_threads")
    op.execute("DROP TABLE IF EXISTS daily_summaries")
    op.execute("ALTER TABLE senders DROP COLUMN IF EXISTS trust_score")
