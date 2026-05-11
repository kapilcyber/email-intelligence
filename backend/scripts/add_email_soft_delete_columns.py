"""Add soft-delete columns to emails if missing (PostgreSQL). Run: python scripts/add_email_soft_delete_columns.py

Use when Alembic history does not match this repo (e.g. DB stamped to a missing revision) but the app
expects emails.deleted_at - without these columns, /api/emails returns empty lists.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def column_exists(conn, table: str, column: str) -> bool:
    from sqlalchemy import text

    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return r.scalar() is not None


def index_exists(conn, name: str) -> bool:
    from sqlalchemy import text

    r = conn.execute(
        text("SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = :n"),
        {"n": name},
    )
    return r.scalar() is not None


def main():
    from app.config import get_settings
    from app.db.session import engine
    from sqlalchemy import text

    get_settings()
    added = []
    with engine.connect() as conn:
        if not column_exists(conn, "emails", "deleted_at"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE"))
            added.append("deleted_at")
        if not column_exists(conn, "emails", "deleted_by_email"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN deleted_by_email VARCHAR(512)"))
            added.append("deleted_by_email")
        if not index_exists(conn, "ix_emails_deleted_at"):
            conn.execute(text("CREATE INDEX ix_emails_deleted_at ON emails (deleted_at)"))
            added.append("index:ix_emails_deleted_at")
        if not index_exists(conn, "ix_emails_deleted_by_email"):
            conn.execute(text("CREATE INDEX ix_emails_deleted_by_email ON emails (deleted_by_email)"))
            added.append("index:ix_emails_deleted_by_email")
        conn.commit()
    if added:
        print("Applied:", ", ".join(added))
    else:
        print("Soft-delete columns already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
