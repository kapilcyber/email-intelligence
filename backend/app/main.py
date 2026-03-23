# Compatibility: time.clock() removed in Python 3.13; SQLAlchemy and others still reference it.
import time
time.clock = getattr(time, "perf_counter", time.time)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from fastapi import Depends, Header

from app.api import health, webhook, emails, dashboard, queue, settings as settings_api, system as system_api, phase3 as phase3_api, admin as admin_api
from app.api.deps import get_current_user_email
from app.config import get_settings
from app.db.session import get_db
from app.db.models import User, Team

settings = get_settings()
app = FastAPI(
    title="Email Intelligence API",
    description="Phase 1 — Email ingestion & infrastructure",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(webhook.router, prefix="/api/webhook", tags=["webhook"])
app.include_router(emails.router, prefix="/api", tags=["emails"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(queue.router, prefix="/api/queue", tags=["queue"])
app.include_router(settings_api.router, prefix="/api", tags=["settings"])
app.include_router(system_api.router, prefix="/api", tags=["system"])
app.include_router(phase3_api.router, prefix="/api", tags=["phase3"])
app.include_router(admin_api.router, prefix="/api/admin", tags=["admin"])


@app.get("/")
def root():
    """Root path: redirect to API info so GET / does not 404."""
    return RedirectResponse("/api", status_code=302)


@app.get("/api")
@app.get("/api/")
def api_root():
    """Avoid 404 when requesting GET /api or GET /api/."""
    return {"name": "Email Intelligence API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/me")
def api_me(
    email: str = Depends(get_current_user_email),
    db=Depends(get_db),
    x_user_name: str | None = Header(None, alias="X-User-Name"),
):
    """Return current user role and isAdmin. Ensures user exists in DB (create/update from session)."""
    settings = get_settings()
    admin_list = [e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()]
    is_admin = email.lower() in admin_list
    role = "Member"
    display_name = (x_user_name or "").strip() or None
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            display_name=display_name or email.split("@")[0],
            role="Member",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if display_name and getattr(user, "display_name", None) != display_name:
            user.display_name = display_name
            db.commit()
    role = getattr(user, "role", "Member") or "Member"
    if role == "Admin":
        is_admin = True
    reporting_manager = None
    department = None
    if getattr(user, "manager_id", None):
        manager = db.query(User).filter(User.id == user.manager_id).first()
        if manager:
            reporting_manager = {
                "displayName": getattr(manager, "display_name", None) or (manager.email.split("@")[0] if manager.email else None),
                "email": manager.email,
            }
    if getattr(user, "team_id", None):
        team = db.query(Team).filter(Team.id == user.team_id).first()
        if team:
            department = team.name
    return {
        "email": email,
        "role": role,
        "isAdmin": is_admin,
        "reportingManager": reporting_manager,
        "department": department,
    }


@app.get("/health")
def health_alias():
    """Common probe path; redirect to real health."""
    return RedirectResponse("/api/health", status_code=302)


@app.get("/favicon.ico")
def favicon():
    """Avoid 404 from browser favicon requests."""
    return Response(status_code=204)


@app.on_event("startup")
def startup():
    import logging
    logger = logging.getLogger("uvicorn.error")
    try:
        from app.db import init_db
        init_db()
        logger.info(
            "Database connected. Team project tables are ensured on startup; run 'alembic upgrade head' for full migrations."
        )
    except Exception as e:
        logger.exception(
            "Database connection failed. Ensure PostgreSQL is running, the database "
            "'email_intelligence' exists (e.g. createdb email_intelligence), run "
            "'alembic upgrade head' for schema, and DATABASE_URL or POSTGRES_* in .env are correct: %s",
            e,
        )
