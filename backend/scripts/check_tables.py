"""Quick check that emails table exists. Run from backend: python scripts/check_tables.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import get_settings
from sqlalchemy import create_engine, text

e = create_engine(get_settings().database_url)
with e.connect() as c:
    r = c.execute(text("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'emails'"))
    exists = r.fetchone() is not None
print("emails table exists:", exists)
sys.exit(0 if exists else 1)
