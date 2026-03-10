"""Add Phase 3 columns (escalation, leads, assigned_team) to emails table. Run from backend: python scripts/add_phase3_columns.py"""
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
    added = []
    with engine.connect() as conn:
        if not column_exists(conn, "emails", "is_escalation"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN is_escalation BOOLEAN DEFAULT FALSE"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_emails_is_escalation ON emails (is_escalation)"))
            added.append("is_escalation")
        if not column_exists(conn, "emails", "assigned_team"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN assigned_team VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_emails_assigned_team ON emails (assigned_team)"))
            added.append("assigned_team")
        if not column_exists(conn, "emails", "lead_label"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN lead_label VARCHAR(32)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_emails_lead_label ON emails (lead_label)"))
            added.append("lead_label")
        conn.commit()
    if added:
        print("Added columns:", ", ".join(added))
    else:
        print("Phase 3 columns already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
