"""Allow same message_id across different mailboxes

Revision ID: 012_message_per_mailbox
Revises: 011_email_bcc
Create Date: 2026-03-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "012_message_per_mailbox"
down_revision: Union[str, None] = "011_email_bcc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_emails_message_id;")
    op.execute("DROP INDEX IF EXISTS emails_message_id_key;")
    op.execute("ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_message_id_key;")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_emails_mailbox_message_id ON emails (mailbox_owner_email, message_id);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_emails_message_id ON emails (message_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_emails_mailbox_message_id;")
    op.execute("DROP INDEX IF EXISTS ix_emails_message_id;")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_emails_message_id ON emails (message_id);")
