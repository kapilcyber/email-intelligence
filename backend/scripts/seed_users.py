"""Add specified users to the users table if they don't exist. Run from backend: python scripts/seed_users.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Emails to add (stored lowercase; display name from local part)
USER_EMAILS = [
    "akshay@cachedigitech.com",
    "deepak.bisht@cachedigitech.com",
    "himank@cachedigitech.com",
    "jaideep@cachedigitech.com",
    "deevenshu@cachedigitech.com",
]


def email_to_display_name(email: str) -> str:
    """Convert email local part to a readable display name."""
    local = email.split("@")[0].strip()
    if not local:
        return "User"
    # e.g. deepak.bisht -> Deepak Bisht
    parts = local.replace(".", " ").replace("_", " ").split()
    return " ".join(p.capitalize() for p in parts) if parts else local.capitalize()


def main():
    from app.config import get_settings
    from app.db.session import init_db, SessionLocal
    from app.db.models import User

    get_settings()
    init_db()

    db = SessionLocal()
    try:
        for raw_email in USER_EMAILS:
            email = raw_email.strip().lower()
            if not email or "@" not in email:
                continue
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                print(f"Already exists: {email}")
                continue
            display_name = email_to_display_name(email)
            user = User(email=email, display_name=display_name, role="Member")
            db.add(user)
            print(f"Created: {email} ({display_name})")
        db.commit()
        print("Seed users complete.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
