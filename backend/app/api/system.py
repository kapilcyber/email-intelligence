"""
System health and observability: webhook status, AI latency, queue backlog.
"""
from datetime import datetime, timezone
from fastapi import APIRouter
from app.config import get_settings
from app.graph.webhook import get_subscription_status
from app.workers.tasks import get_queue_stats, get_ai_latency_avg_seconds
import redis

router = APIRouter()

LAST_WEBHOOK_KEY = "last_webhook_notify_at"


def get_last_webhook_timestamp_iso() -> str | None:
    """Last time we received a webhook notification (ISO string)."""
    try:
        r = redis.from_url(get_settings().redis_url)
        raw = r.get(LAST_WEBHOOK_KEY)
        if raw is None:
            return None
        s = raw.decode() if isinstance(raw, bytes) else str(raw)
        return s
    except Exception:
        return None


@router.get("/system/health")
def system_health():
    """
    Extended system health: webhook status, last webhook timestamp,
    AI latency average, queue backlog. For dashboards and monitoring.
    """
    # Webhook status
    sub = get_subscription_status()
    webhook_status_val = "inactive"
    last_webhook = get_last_webhook_timestamp_iso()
    if sub:
        exp = sub.get("expirationDateTime")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                if (exp_dt - datetime.now(exp_dt.tzinfo)).total_seconds() < 3600:
                    webhook_status_val = "expiring"
                else:
                    webhook_status_val = "active"
            except Exception:
                webhook_status_val = "active"
        else:
            webhook_status_val = "active"

    queue_stats = get_queue_stats()
    ai_latency_avg = get_ai_latency_avg_seconds()

    return {
        "webhookStatus": webhook_status_val,
        "lastWebhookTimestamp": last_webhook,
        "aiLatencyAvgSeconds": round(ai_latency_avg, 2) if ai_latency_avg is not None else None,
        "queueBacklog": queue_stats.get("pending", 0),
        "queueActive": queue_stats.get("active", 0),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
