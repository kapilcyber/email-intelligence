"""
Microsoft Graph change notifications: subscribe, validate, renew.
"""
from typing import Any
import httpx
from app.config import get_settings
from app.graph.auth import get_auth_headers

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
EXPIRATION_MINUTES = 4230  # max ~3 days

_subscription_cache: dict[str, Any] = {}


def _subscription_resource(user_id: str) -> str:
    """Use users/{id}/... for app-only (client_credentials) auth; 'me' only works for delegated auth."""
    return f"users/{user_id}/mailFolders/inbox/messages"


def subscribe(user_id: str, change_type: str = "created") -> dict[str, Any]:
    settings = get_settings()
    if not settings.webhook_base_url or not settings.webhook_base_url.strip():
        raise ValueError("WEBHOOK_BASE_URL is not set. Required for Graph subscriptions (Phase 2+).")
    notification_url = f"{settings.webhook_base_url.rstrip('/')}/api/webhook/notify"
    payload = {
        "changeType": change_type,
        "notificationUrl": notification_url,
        "resource": _subscription_resource(user_id),
        "expirationDateTime": None,
    }
    from datetime import datetime, timezone, timedelta
    exp = datetime.now(timezone.utc) + timedelta(minutes=EXPIRATION_MINUTES)
    payload["expirationDateTime"] = exp.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    url = f"{GRAPH_BASE}/subscriptions"
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, json=payload, headers=get_auth_headers())
        r.raise_for_status()
        data = r.json()
    _subscription_cache["current"] = data
    return data


def renew_subscription(subscription_id: str) -> dict[str, Any]:
    from datetime import datetime, timezone, timedelta
    exp = datetime.now(timezone.utc) + timedelta(minutes=EXPIRATION_MINUTES)
    url = f"{GRAPH_BASE}/subscriptions/{subscription_id}"
    payload = {"expirationDateTime": exp.strftime("%Y-%m-%dT%H:%M:%S.000Z")}
    with httpx.Client(timeout=30.0) as client:
        r = client.patch(url, json=payload, headers=get_auth_headers())
        r.raise_for_status()
        data = r.json()
    _subscription_cache["current"] = data
    return data


def get_subscription_status() -> dict[str, Any] | None:
    return _subscription_cache.get("current")


def set_subscription_status(data: dict[str, Any] | None) -> None:
    if data is None:
        _subscription_cache.pop("current", None)
    else:
        _subscription_cache["current"] = data


def validate_notification(validation_token: str) -> str:
    return validation_token
