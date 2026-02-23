from typing import Any
import httpx
from app.config import get_settings
from app.graph.auth import get_auth_headers

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def _get(url: str, params: dict | None = None) -> dict[str, Any]:
    settings = get_settings()
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            url,
            params=params or {},
            headers=get_auth_headers(),
        )
        r.raise_for_status()
        return r.json()


def get_message(user_id: str, message_id: str) -> dict[str, Any]:
    url = f"{GRAPH_BASE}/users/{user_id}/messages/{message_id}"
    return _get(url)


def list_messages(
    user_id: str,
    folder_id: str = "inbox",
    top: int = 100,
    skip: int = 0,
    filter_query: str | None = None,
) -> dict[str, Any]:
    path = f"{GRAPH_BASE}/users/{user_id}/mailFolders/{folder_id}/messages"
    params: dict[str, Any] = {"$top": top, "$skip": skip}
    if filter_query:
        params["$filter"] = filter_query
    return _get(path, params)
