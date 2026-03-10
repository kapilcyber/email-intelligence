"""Create teams and users tables (if missing) and seed the six teams. Run from backend: python scripts/seed_teams.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TEAM_NAMES = [
    "Tech",
    "Networking",
    "Cybersecurity",
    "Sales",
    "Accounts",
    "Data & AI",
]


def main():
    from app.config import get_settings
    from app.db.session import engine, init_db
    from app.db.models import Team
    from sqlalchemy.orm import Session
    from app.db.session import SessionLocal

    get_settings()
    init_db()  # creates teams and users tables if they don't exist

    db = SessionLocal()
    try:
        for name in TEAM_NAMES:
            existing = db.query(Team).filter(Team.name == name).first()
            if not existing:
                slug = name.lower().replace(" ", "-").replace("&", "and")
                team = Team(name=name, slug=slug)
                db.add(team)
                print(f"Created team: {name}")
        db.commit()
        print("Teams seed complete.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
