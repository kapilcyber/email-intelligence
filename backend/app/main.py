# Compatibility: time.clock() removed in Python 3.13; SQLAlchemy and others still reference it.
import time
time.clock = getattr(time, "perf_counter", time.time)

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from fastapi import Depends, Header, HTTPException

from app.api import health, webhook, emails, dashboard, queue, settings as settings_api, system as system_api, phase3 as phase3_api, admin as admin_api, admin_tracker as admin_tracker_api, admin_review as admin_review_api, mom as mom_api
from app.api.deps import get_current_user_email
from app.config import get_settings
from app.db.session import get_db
from app.db.models import User, Team, UserLoginEvent

settings = get_settings()
app = FastAPI(
    title="Email Intelligence API",
    description="Phase 1 — Email ingestion & infrastructure",
    version="1.0.0",
)


def _validate_startup_configuration() -> None:
    """Fail fast in production (or strict mode) when critical config is missing."""
    strict = settings.is_production() or settings.strict_dependency_checks
    if not strict:
        return

    missing: list[str] = []
    if not settings.database_url:
        missing.append("DATABASE_URL")
    if not settings.redis_url:
        missing.append("REDIS_URL")
    if not settings.azure_tenant_id:
        missing.append("AZURE_TENANT_ID")
    if not settings.azure_client_id:
        missing.append("AZURE_CLIENT_ID")
    if not settings.azure_client_secret:
        missing.append("AZURE_CLIENT_SECRET")
    if not settings.cors_origin_list():
        missing.append("CORS_ORIGINS")
    if missing:
        raise RuntimeError(
            "Missing required environment configuration: " + ", ".join(sorted(missing))
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
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
app.include_router(mom_api.router, prefix="/api/mom", tags=["mom"])
app.include_router(admin_api.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_tracker_api.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_review_api.router, prefix="/api/admin", tags=["admin"])


@app.get("/")
def root():
    """Root path: redirect to API info so GET / does not 404."""
    return RedirectResponse("/api", status_code=302)


@app.get("/api")
@app.get("/api/")
def api_root():
    """Avoid 404 when requesting GET /api or GET /api/."""
    return {"name": "Email Intelligence API", "docs": "/docs", "health": "/api/health"}


def _record_login_event(db, user: User, login_source: str | None, newly_created: bool) -> None:
    """Persist login timeline: every OAuth sign-in; first DB touch for new user; throttled session pings (6h)."""
    now = datetime.now(timezone.utc)
    src = (login_source or "").strip().lower()
    oauth = src == "oauth"
    if oauth:
        should_log = True
    elif newly_created:
        should_log = True
    else:
        cutoff = now - timedelta(hours=6)
        recent = (
            db.query(UserLoginEvent)
            .filter(UserLoginEvent.user_id == user.id, UserLoginEvent.occurred_at >= cutoff)
            .first()
        )
        should_log = recent is None
    if not should_log:
        return
    db.add(
        UserLoginEvent(
            user_id=user.id,
            email=user.email,
            occurred_at=now,
            source="oauth" if oauth else "session",
        )
    )
    db.commit()


def _role_promotion_payload(user: User, role: str) -> dict | None:
    """Non-dismissed role elevation banner for Manager/Admin."""
    if role not in ("Admin", "Manager"):
        return None
    promoted_at = getattr(user, "role_promoted_at", None)
    if promoted_at is None:
        return None
    dismissed_at = getattr(user, "role_promotion_dismissed_at", None)
    if dismissed_at is not None and promoted_at <= dismissed_at:
        return None
    return {
        "show": True,
        "role": role,
        "promotedAt": promoted_at.isoformat(),
    }


def _api_me_sync(
    email: str,
    db,
    x_user_name: str | None,
    x_login_source: str | None = None,
) -> dict:
    """Return current user role and isAdmin. Ensures user exists in DB (create/update from session)."""
    settings = get_settings()
    admin_list = [e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()]
    is_admin = email.lower() in admin_list
    display_name = (x_user_name or "").strip() or None
    now = datetime.now(timezone.utc)
    user_created = False
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user_created = True
        user = User(
            email=email,
            display_name=display_name or email.split("@")[0],
            role="Member",
            last_login_at=now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if display_name and getattr(user, "display_name", None) != display_name:
            user.display_name = display_name
        user.last_login_at = now
        db.commit()
        db.refresh(user)
    _record_login_event(db, user, x_login_source, user_created)
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
    role_promotion = _role_promotion_payload(user, role)
    return {
        "userId": user.id,
        "email": email,
        "role": role,
        "isAdmin": is_admin,
        "reportingManager": reporting_manager,
        "department": department,
        "rolePromotion": role_promotion,
    }


@app.get("/api/me")
def api_me(
    email: str = Depends(get_current_user_email),
    db=Depends(get_db),
    x_user_name: str | None = Header(None, alias="X-User-Name"),
    x_login_source: str | None = Header(None, alias="X-Login-Source"),
):
    """Return current user; upsert user row and refresh last_login_at. Prefer POST from server-side callers (no GET caching)."""
    return _api_me_sync(email, db, x_user_name, x_login_source)


@app.post("/api/me")
def api_me_post(
    email: str = Depends(get_current_user_email),
    db=Depends(get_db),
    x_user_name: str | None = Header(None, alias="X-User-Name"),
    x_login_source: str | None = Header(None, alias="X-Login-Source"),
):
    """Same as GET /api/me — use after OAuth so new users appear in admin lists even before the SPA loads."""
    return _api_me_sync(email, db, x_user_name, x_login_source)


@app.post("/api/me/dismiss-role-promotion")
def api_me_dismiss_role_promotion(
    email: str = Depends(get_current_user_email),
    db=Depends(get_db),
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role_promotion_dismissed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


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
        _validate_startup_configuration()
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
