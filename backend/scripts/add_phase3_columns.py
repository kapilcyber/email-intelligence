"""Add Phase 3 columns (routing, escalation, leads, trust) if missing. Run from backend: python scripts/add_phase3_columns.py"""
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
        # emails
        if not column_exists(conn, "emails", "assigned_team"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN assigned_team VARCHAR(64)"))
            added.append("emails.assigned_team")
        if not column_exists(conn, "emails", "is_escalation"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN is_escalation BOOLEAN DEFAULT FALSE"))
            added.append("emails.is_escalation")
        if not column_exists(conn, "emails", "escalation_metadata"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN escalation_metadata JSONB"))
            added.append("emails.escalation_metadata")
        if not column_exists(conn, "emails", "lead_label"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN lead_label VARCHAR(16)"))
            added.append("emails.lead_label")
        if not column_exists(conn, "emails", "is_spam"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN is_spam BOOLEAN DEFAULT FALSE"))
            added.append("emails.is_spam")
        # senders
        if not column_exists(conn, "senders", "trust_score"):
            conn.execute(text("ALTER TABLE senders ADD COLUMN trust_score FLOAT"))
            added.append("senders.trust_score")
        if not column_exists(conn, "senders", "importance_weight"):
            conn.execute(text("ALTER TABLE senders ADD COLUMN importance_weight FLOAT"))
            added.append("senders.importance_weight")
        conn.commit()
    if added:
        print("Added columns:", ", ".join(added))
    else:
        print("Phase 3 columns already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
