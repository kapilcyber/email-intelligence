"""
Add Phase 2 observability and state columns: processing_status, ai_status, ai_error_message, ai_confidence_score.
Run from backend: python scripts/add_phase2_observability_columns.py
"""
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
        if not column_exists(conn, "emails", "processing_status"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN processing_status VARCHAR(32) DEFAULT 'ingested'"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_emails_processing_status ON emails (processing_status)"))
            added.append("processing_status")
        if not column_exists(conn, "emails", "ai_status"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_status VARCHAR(32) DEFAULT 'pending'"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_emails_ai_status ON emails (ai_status)"))
            added.append("ai_status")
        if not column_exists(conn, "emails", "ai_error_message"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_error_message TEXT"))
            added.append("ai_error_message")
        if not column_exists(conn, "emails", "ai_confidence_score"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_confidence_score FLOAT"))
            added.append("ai_confidence_score")
        conn.commit()

    # Backfill: set processing_status and ai_status for existing classified rows
    with engine.connect() as conn:
        if column_exists(conn, "emails", "processing_status"):
            conn.execute(
                text(
                    "UPDATE emails SET processing_status = 'classified' WHERE ai_processed_at IS NOT NULL AND (processing_status IS NULL OR processing_status = 'ingested')"
                )
            )
        if column_exists(conn, "emails", "ai_status"):
            conn.execute(
                text(
                    "UPDATE emails SET ai_status = 'completed' WHERE ai_processed_at IS NOT NULL AND (ai_status IS NULL OR ai_status = 'pending')"
                )
            )
        conn.commit()
    if added:
        print("Added columns:", ", ".join(added))
    else:
        print("Phase 2 observability columns already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
