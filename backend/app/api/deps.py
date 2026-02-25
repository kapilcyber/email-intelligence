"""Shared FastAPI dependencies (e.g. current user for per-user dashboard)."""
from fastapi import Header, HTTPException


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
