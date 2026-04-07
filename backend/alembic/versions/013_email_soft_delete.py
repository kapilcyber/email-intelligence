"""Email soft delete (user History) + admin deleted-mail audit

Revision ID: 013_email_soft_delete
Revises: 012_message_per_mailbox
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_email_soft_delete"
down_revision: Union[str, None] = "012_message_per_mailbox"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("emails", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("emails", sa.Column("deleted_by_email", sa.String(length=512), nullable=True))
    op.create_index(op.f("ix_emails_deleted_at"), "emails", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_emails_deleted_by_email"), "emails", ["deleted_by_email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_emails_deleted_by_email"), table_name="emails")
    op.drop_index(op.f("ix_emails_deleted_at"), table_name="emails")
    op.drop_column("emails", "deleted_by_email")
    op.drop_column("emails", "deleted_at")
