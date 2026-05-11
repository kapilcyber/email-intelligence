"""
Microsoft Graph: enumerate a user's mail folder tree for full-mailbox sync.
"""
from __future__ import annotations

import logging
from typing import Any

from app.graph.auth import get_auth_headers
from app.http_client import httpx_client

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def list_user_mail_folders_flat(user_id: str) -> list[dict[str, Any]]:
    """
    Depth-first walk of mailFolders + childFolders (paginated).
    Each item includes id, displayName, childFolderCount, wellKnownName (when Graph provides it).
    """
    uid = (user_id or "").strip()
    if not uid:
        return []
    headers = get_auth_headers()
    params = {"$select": "id,displayName,childFolderCount", "$top": 100}
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    stack: list[str | None] = [None]

    with httpx_client(timeout=90.0) as client:
        while stack:
            parent_id = stack.pop()
            if parent_id is None:
                next_url: str | None = f"{GRAPH_BASE}/users/{uid}/mailFolders"
            else:
                next_url = f"{GRAPH_BASE}/users/{uid}/mailFolders/{parent_id}/childFolders"
            next_params: dict[str, Any] | None = dict(params)

            while next_url:
                r = client.get(next_url, params=next_params, headers=headers)
                if r.status_code != 200:
                    logger.warning(
                        "list_user_mail_folders_flat user=%s parent=%s status=%s body=%s",
                        uid,
                        parent_id,
                        r.status_code,
                        (r.text or "")[:800],
                    )
                    break
                data = r.json()
                for item in data.get("value", []) or []:
                    fid = item.get("id")
                    if not fid or fid in seen:
                        continue
                    seen.add(fid)
                    out.append(item)
                    try:
                        cc = int(item.get("childFolderCount") or 0)
                    except (TypeError, ValueError):
                        cc = 0
                    if cc > 0:
                        stack.append(fid)
                nl = data.get("@odata.nextLink")
                next_url = nl if isinstance(nl, str) else None
                next_params = None

    return out


def _parse_csv_lower(s: str | None) -> set[str]:
    if not s or not str(s).strip():
        return set()
    return {x.strip().lower() for x in str(s).split(",") if x.strip()}


def filter_folders_for_sync(
    folders: list[dict[str, Any]],
    *,
    skip_well_known_names: set[str],
    skip_name_substrings: tuple[str, ...],
    max_folders: int,
) -> list[dict[str, Any]]:
    """Drop recoverable / sync issue style folders and cap count."""
    kept: list[dict[str, Any]] = []
    for item in folders:
        wkn = (item.get("wellKnownName") or "").strip().lower()
        if wkn in skip_well_known_names:
            continue
        if wkn.startswith("recoverableitems"):
            continue
        dn = (item.get("displayName") or "").strip().lower()
        if any(sub in dn for sub in skip_name_substrings if sub):
            continue
        kept.append(item)
        if len(kept) >= max_folders:
            logger.warning(
                "filter_folders_for_sync: cap reached (%s folders); remaining folders skipped",
                max_folders,
            )
            break
    return kept


def parse_skip_well_known_names(csv: str | None) -> set[str]:
    return {x.strip().lower() for x in (csv or "").split(",") if x.strip()}


def parse_skip_folder_name_substrings(csv: str | None) -> tuple[str, ...]:
    return tuple(x.strip().lower() for x in (csv or "").split(",") if x.strip())
