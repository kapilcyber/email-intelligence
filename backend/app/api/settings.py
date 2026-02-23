from fastapi import APIRouter
from app.config import get_settings

router = APIRouter()


def _mask(s: str) -> str:
    if not s or len(s) < 12:
        return "••••••••"
    return s[:4] + "••••••••" + s[-4:]


@router.get("/settings")
def get_settings_route():
    s = get_settings()
    return {
        "tenantId": _mask(s.azure_tenant_id) if s.azure_tenant_id else "",
        "graphClientId": _mask(s.azure_client_id) if s.azure_client_id else "",
        "redisHost": s.redis_url.replace("redis://", "").split("/")[0],
        "databaseHost": s.database_url.split("@")[-1].split("/")[0] if "@" in s.database_url else "",
        "environment": s.environment,
    }
