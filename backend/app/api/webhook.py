from datetime import datetime, timezone
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from app.config import get_settings
from app.graph.webhook import get_subscription_status, subscribe
from app.workers.tasks import ingest_email_task
import redis

router = APIRouter()
LAST_WEBHOOK_KEY = "last_webhook_notify_at"


class SubscribeBody(BaseModel):
    user_id: str


@router.get("/status")
def webhook_status():
    sub = get_subscription_status()
    status = "error"
    if sub:
        exp = sub.get("expirationDateTime")
        if exp:
            from datetime import datetime, timezone
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                if (exp_dt - datetime.now(exp_dt.tzinfo)).total_seconds() < 3600:
                    status = "expiring"
                else:
                    status = "active"
            except Exception:
                status = "active"
        else:
            status = "active"
    return {
        "subscription": {
            "subscriptionId": sub.get("id"),
            "expirationTime": sub.get("expirationDateTime"),
            "lastRenewalTime": sub.get("lastRenewalTime") or sub.get("expirationDateTime"),
            "validationStatus": "valid" if sub else "failed",
            "resource": sub.get("resource") if sub else None,
        } if sub else None,
        "status": status,
        "errorLogs": [],
    }


@router.post("/notify")
async def notify(request: Request):
    """
    Microsoft Graph sends POST here for validation (query param) or for change notifications (body).
    """
    validation_token = request.query_params.get("validationToken")
    if validation_token:
        return Response(content=validation_token, media_type="text/plain")
    body = await request.json()
    try:
        r = redis.from_url(get_settings().redis_url)
        r.set(LAST_WEBHOOK_KEY, datetime.now(timezone.utc).isoformat())
    except Exception:
        pass
    for notification in body.get("value", []):
        resource = notification.get("resource")
        resource_data = notification.get("resourceData") or {}
        graph_id = resource_data.get("id")
        if resource and graph_id:
            ingest_email_task.delay(resource, graph_id)
    return Response(status_code=202)


@router.post("/subscribe")
def webhook_subscribe(body: SubscribeBody):
    """Create a Graph subscription for the given user (inbox messages)."""
    try:
        sub = subscribe(body.user_id)
        return {"ok": True, "subscription": sub}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": str(e)})
