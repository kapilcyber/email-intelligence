"""Shared FastAPI dependencies (e.g. current user for per-user dashboard)."""
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db


def get_current_user_email(x_user_email: str | None = Header(None, alias="X-User-Email")) -> str:
    """
    Require X-User-Email header (set by frontend from NextAuth session).
    Returns normalized email; 401 if missing or invalid.
    """
    if not x_user_email or not (email := x_user_email.strip()):
        raise HTTPException(status_code=401, detail="X-User-Email header is required")
    if "@" not in email or len(email) > 512:
        raise HTTPException(status_code=401, detail="Invalid X-User-Email")
    return email.lower()


def get_current_user_email_optional(x_user_email: str | None = Header(None, alias="X-User-Email")) -> str | None:
    """Return current user email from header if present; None otherwise. No 401."""
    if not x_user_email or not (email := x_user_email.strip()) or "@" not in email or len(email) > 512:
        return None
    return email.lower()


def get_admin_user(
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """
    Require authenticated user and admin access. Admin = in ADMIN_EMAILS env or User.role == Admin.
    """
    from app.db.models import User
    settings = get_settings()
    admin_list = [e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()]
    if admin_list and email.lower() in admin_list:
        return email
    user_row = db.query(User).filter(User.email == email).first()
    if user_row and getattr(user_row, "role", None) == "Admin":
        return email
    raise HTTPException(status_code=403, detail="Admin access required")


def get_admin_or_manager_user(
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    """
    Require Admin (env list or User.role == Admin) or org role Manager.
    Used for tracker, review, team oversight, and per-user escalations/leads views.
    """
    from app.db.models import User

    settings = get_settings()
    admin_list = [e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()]
    if admin_list and email.lower() in admin_list:
        return email
    user_row = db.query(User).filter(User.email == email).first()
    role = getattr(user_row, "role", None) if user_row else None
    if role in ("Admin", "Manager"):
        return email
    raise HTTPException(status_code=403, detail="Admin or Manager access required")
