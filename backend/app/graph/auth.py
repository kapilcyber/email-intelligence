import time
import httpx
from app.config import get_settings

_token_cache: dict[str, tuple[float, str]] = {}  # (expires_at, token)
TOKEN_BUFFER_SECONDS = 300


def get_access_token() -> str:
    settings = get_settings()
    now = time.time()
    key = f"{settings.azure_tenant_id}:{settings.azure_client_id}"
    if key in _token_cache:
        expires_at, token = _token_cache[key]
        if now < expires_at - TOKEN_BUFFER_SECONDS:
            return token
    url = f"https://login.microsoftonline.com/{settings.azure_tenant_id}/oauth2/v2.0/token"
    data = {
        "client_id": settings.azure_client_id,
        "client_secret": settings.azure_client_secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    with httpx.Client() as client:
        r = client.post(url, data=data)
        r.raise_for_status()
        body = r.json()
    token = body["access_token"]
    expires_in = body.get("expires_in", 3600)
    _token_cache[key] = (now + expires_in, token)
    return token


def get_auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_access_token()}"}
