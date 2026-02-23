"""Add Phase 2 AI columns to emails table if missing. Run from backend: python scripts/add_phase2_columns.py"""
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
        if not column_exists(conn, "emails", "ai_summary"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_summary TEXT"))
            added.append("ai_summary")
        if not column_exists(conn, "emails", "ai_category"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_category VARCHAR(64)"))
            added.append("ai_category")
        if not column_exists(conn, "emails", "ai_priority_score"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_priority_score FLOAT"))
            added.append("ai_priority_score")
        if not column_exists(conn, "emails", "ai_priority_label"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_priority_label VARCHAR(32)"))
            added.append("ai_priority_label")
        if not column_exists(conn, "emails", "ai_suggested_replies"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_suggested_replies JSONB"))
            added.append("ai_suggested_replies")
        if not column_exists(conn, "emails", "ai_processed_at"):
            conn.execute(text("ALTER TABLE emails ADD COLUMN ai_processed_at TIMESTAMP WITH TIME ZONE"))
            added.append("ai_processed_at")
        conn.commit()
    if added:
        print("Added columns:", ", ".join(added))
    else:
        print("Phase 2 columns already present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
