import logging
import sys
from celery import Celery
from celery.signals import worker_init
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
celery_app = Celery(
    "email_intelligence",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)
# Ensure all tasks (including backfill_classify_emails_task) are registered when app loads
import app.workers.tasks  # noqa: F401, E402

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_retry_delay=60,
    task_max_retries=5,
    broker_connection_retry_on_startup=True,
)
# On Windows, default prefork pool can raise "ValueError: not enough values to unpack" in Celery trace
if sys.platform == "win32":
    celery_app.conf.worker_pool = "solo"


@worker_init.connect
def ensure_tables_on_worker_start(sender, **kwargs):
    """Ensure DB tables exist when worker starts (avoids 'relation emails does not exist')."""
    try:
        from app.db import init_db
        init_db()
        logger.info("Database tables ready.")
    except Exception as e:
        logger.exception(
            "Database tables init failed. Ensure PostgreSQL is running and run: python scripts/create_db.py, then start API once or: python -c \"from app.db import init_db; init_db()\": %s",
            e,
        )
        raise
