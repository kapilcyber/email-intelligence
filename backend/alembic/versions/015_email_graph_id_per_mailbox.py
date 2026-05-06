"""Make graph_id unique per mailbox instead of globally

Revision ID: 015_graph_mailbox
Revises: 014_mailbox_message_rules
Create Date: 2026-05-05

Global unique(ix_emails_graph_id) caused ingest failures when the same mailbox
was synced with matching graph id but differing internetMessageId handling,
and blocks legitimate multi-mailbox scenarios.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "015_graph_mailbox"
down_revision: Union[str, None] = "014_mailbox_message_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_graph_id_key;")
    op.execute("DROP INDEX IF EXISTS ix_emails_graph_id;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_graph_id ON emails (graph_id);")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_emails_mailbox_graph_id ON emails "
        "(mailbox_owner_email, graph_id) WHERE graph_id IS NOT NULL "
        "AND mailbox_owner_email IS NOT NULL;"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_emails_mailbox_graph_id;")
    op.execute("DROP INDEX IF EXISTS ix_emails_graph_id;")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_emails_graph_id ON emails (graph_id);")
