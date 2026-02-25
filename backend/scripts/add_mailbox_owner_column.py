"""Add mailbox_owner_email column to emails for per-user dashboard. Run from backend: python scripts/add_mailbox_owner_column.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def column_exists(conn, table: str, column: str) -> bool:
    from sqlalchemy import text
    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return r.scalar() is not None


def main():
    from app.config import get_settings
    from app.db.session import engine
    from sqlalchemy import text

    get_settings()
    with engine.connect() as conn:
        if not column_exists(conn, "emails", "mailbox_owner_email"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN mailbox_owner_email VARCHAR(512)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_emails_mailbox_owner_email ON emails(mailbox_owner_email)"))
            conn.commit()
            print("Added emails.mailbox_owner_email and index.")
        else:
            print("Column emails.mailbox_owner_email already present.")

        # Optional: backfill existing rows with MAILBOX_EMAIL from config so legacy data is attributed
        settings = get_settings()
        default_mailbox = (settings.mailbox_email or "").strip()
        if default_mailbox:
            result = conn.execute(
                text("UPDATE emails SET mailbox_owner_email = :mb WHERE mailbox_owner_email IS NULL"),
                {"mb": default_mailbox},
            )
            conn.commit()
            if result.rowcount and result.rowcount > 0:
                print(f"Backfilled {result.rowcount} existing rows with mailbox_owner_email = {default_mailbox}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
