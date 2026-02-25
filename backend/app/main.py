from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from app.api import health, webhook, emails, dashboard, queue, settings as settings_api, system as system_api, phase3 as phase3_api
from app.config import get_settings

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


@app.get("/")
def root():
    """Root path: redirect to API info so GET / does not 404."""
    return RedirectResponse("/api", status_code=302)


@app.get("/api")
@app.get("/api/")
def api_root():
    """Avoid 404 when requesting GET /api or GET /api/."""
    return {"name": "Email Intelligence API", "docs": "/docs", "health": "/api/health"}


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
        logger.info("Database connected and tables ready.")
    except Exception as e:
        logger.exception(
            "Database connection failed. Ensure PostgreSQL is running, the database "
            "'email_intelligence' exists (e.g. createdb email_intelligence), and "
            "DATABASE_URL or POSTGRES_* in .env are correct: %s",
            e,
        )
