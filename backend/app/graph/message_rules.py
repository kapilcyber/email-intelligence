"""Fetch Outlook inbox messageRules from Microsoft Graph (MailboxSettings.Read)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from app.graph.auth import get_auth_headers
from app.http_client import httpx_client

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class GraphMessageRulesError(Exception):
    """Graph returned an error listing message rules."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Graph messageRules {status_code}: {message}")


def _encode_user_segment(user_id: str) -> str:
    return quote((user_id or "").strip(), safe="")


def list_inbox_message_rules(graph_user_id: str) -> list[dict[str, Any]]:
    """
    Return all messageRule objects for the mailbox inbox folder (paginated).
    graph_user_id: UPN or SMTP (lowercase email) or Graph user id.
    """
    uid = (graph_user_id or "").strip()
    if not uid:
        return []
    first = f"{GRAPH_BASE}/users/{_encode_user_segment(uid)}/mailFolders/inbox/messageRules"
    out: list[dict[str, Any]] = []
    next_url: str | None = first
    with httpx_client(timeout=45.0) as client:
        while next_url:
            r = client.get(next_url, headers=get_auth_headers())
            if r.status_code != 200:
                msg = (r.text or "")[:1200]
                try:
                    err = r.json().get("error") or {}
                    if isinstance(err, dict) and err.get("message"):
                        msg = str(err.get("message"))[:1200]
                except Exception:
                    pass
                raise GraphMessageRulesError(r.status_code, msg)
            data = r.json()
            value = data.get("value")
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        out.append(item)
            next_link = data.get("@odata.nextLink")
            if isinstance(next_link, str) and next_link.strip():
                next_url = next_link.strip()
            else:
                next_url = None
    return out
