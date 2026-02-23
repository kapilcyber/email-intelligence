"""Create all DB tables. Run from backend: python scripts/init_tables.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

def main():
    from app.config import get_settings
    from app.db.session import engine
    from app.db import models  # noqa: F401
    from app.db.session import Base
    from sqlalchemy import text

    s = get_settings()
    # Redact password in URL for logging
    url = s.database_url
    if "@" in url and ":" in url:
        parts = url.split("@")
        if len(parts) == 2:
            url = "***@" + parts[1]
    print("Database URL (redacted):", url)

    from sqlalchemy.exc import ProgrammingError
    try:
        Base.metadata.create_all(bind=engine)
        print("create_all() completed.")
    except ProgrammingError as e:
        msg = str(e.orig) if getattr(e, "orig", None) else str(e)
        if "already exists" in msg.lower():
            print("create_all() skipped (some objects already exist).")
        else:
            raise

    with engine.connect() as c:
        db = c.execute(text("SELECT current_database()")).scalar()
        print("Session engine connected to DB:", db)
        r = c.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"))
        tables = [row[0] for row in r]
    print("Tables in public schema:", tables)
    return 0

if __name__ == "__main__":
    sys.exit(main())
