"""
Create the email_intelligence database if it doesn't exist.
Run once before first starting the API (e.g. after installing PostgreSQL / pgAdmin).

  From backend folder: python scripts/create_db.py
"""
import sys
from pathlib import Path

# Ensure backend root is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings

def main():
    s = get_settings()
    # Connect to default 'postgres' DB to create our database
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    except ImportError:
        print("psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)

    # Build URL for default postgres database (not email_intelligence)
    host = s.postgres_host
    port = s.postgres_port
    user = s.postgres_user
    password = s.postgres_password
    dbname = s.postgres_db

    conn = None
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname="postgres",
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (dbname,),
        )
        if cur.fetchone():
            print(f"Database '{dbname}' already exists. Nothing to do.")
        else:
            cur.execute(f'CREATE DATABASE "{dbname}"')
            print(f"Database '{dbname}' created successfully.")
        cur.close()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()
