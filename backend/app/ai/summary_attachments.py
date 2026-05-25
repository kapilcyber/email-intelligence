"""
Fetch attachment bytes from Microsoft Graph and extract plain text for on-demand
email summary (single combined summary with mail body in classifier).
"""
from __future__ import annotations

import base64
import logging
import re
import xml.etree.ElementTree as ET
from io import BytesIO
from urllib.parse import quote
from zipfile import ZipFile, BadZipFile

from sqlalchemy.orm import Session

from app.db.models import Attachment, Email
from app.graph.auth import get_auth_headers
from app.http_client import httpx_client

logger = logging.getLogger(__name__)

# Limits: keep summary task bounded (Graph + Ollama context).
_MAX_ATTACHMENTS = 5
_MAX_BYTES_PER_FILE = 5 * 1024 * 1024
_MAX_TOTAL_EXCERPT_CHARS = 12_000
_MAX_PDF_PAGES = 25

_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _graph_attachment_url(mailbox: str, message_graph_id: str, graph_attachment_id: str) -> str:
    user_seg = quote((mailbox or "").strip(), safe="@")
    return (
        f"https://graph.microsoft.com/v1.0/users/{user_seg}/messages/{message_graph_id}"
        f"/attachments/{graph_attachment_id}"
    )


def _fetch_file_attachment_json(mailbox: str, message_graph_id: str, graph_attachment_id: str) -> dict | None:
    url = _graph_attachment_url(mailbox, message_graph_id, graph_attachment_id)
    try:
        with httpx_client(timeout=60.0) as client:
            r = client.get(url, headers=get_auth_headers())
    except Exception as e:
        logger.warning("summary_attachments: graph fetch error att=%s err=%s", graph_attachment_id[:16], e)
        return None
    if r.status_code != 200:
        logger.warning(
            "summary_attachments: graph status=%s att=%s body=%s",
            r.status_code,
            graph_attachment_id[:16],
            (r.text or "")[:200],
        )
        return None
    try:
        return r.json()
    except Exception:
        return None


def _decode_graph_file_attachment(data: dict) -> bytes | None:
    if data.get("@odata.type") != "#microsoft.graph.fileAttachment":
        return None
    b64 = data.get("contentBytes")
    if not b64:
        return None
    try:
        return base64.b64decode(b64)
    except Exception:
        return None


def _extract_pdf_text(raw: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.warning("summary_attachments: pypdf not installed; skipping PDF text")
        return ""
    try:
        reader = PdfReader(BytesIO(raw))
        parts: list[str] = []
        for i, page in enumerate(reader.pages):
            if i >= _MAX_PDF_PAGES:
                break
            try:
                t = page.extract_text() or ""
            except Exception:
                t = ""
            t = t.strip()
            if t:
                parts.append(t)
        return "\n\n".join(parts).strip()
    except Exception as e:
        logger.info("summary_attachments: pdf extract failed err=%s", e)
        return ""


def _extract_docx_text(raw: bytes) -> str:
    try:
        with ZipFile(BytesIO(raw)) as zf:
            if "word/document.xml" not in zf.namelist():
                return ""
            xml_bytes = zf.read("word/document.xml")
    except (BadZipFile, KeyError, OSError) as e:
        logger.info("summary_attachments: docx zip read failed err=%s", e)
        return ""
    try:
        tree = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return ""
    chunks: list[str] = []
    for el in tree.iter():
        if el.tag == f"{{{_W_NS}}}t" and el.text:
            chunks.append(el.text)
    text = " ".join(chunks)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_plain_text(raw: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            s = raw.decode(enc)
            break
        except UnicodeDecodeError:
            s = ""
    else:
        s = raw.decode("utf-8", errors="replace")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _extract_bytes_to_plain(raw: bytes, content_type: str, filename: str) -> str:
    ct = (content_type or "").lower().split(";")[0].strip()
    fn = (filename or "").lower()

    if ct == "application/pdf" or fn.endswith(".pdf"):
        return _extract_pdf_text(raw)
    if ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or fn.endswith(".docx"):
        return _extract_docx_text(raw)
    if ct in ("text/plain", "text/csv", "text/markdown") or fn.endswith((".txt", ".csv", ".md")):
        return _extract_plain_text(raw)[:8000]
    return ""


def _is_summarizable_document(att: Attachment) -> bool:
    ct = (att.content_type or "").lower().split(";")[0].strip()
    fn = (att.name or "").lower()
    if ct.startswith("image/"):
        return False
    if att.is_inline and (ct.startswith("image/") or fn.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"))):
        return False
    if ct == "application/pdf" or fn.endswith(".pdf"):
        return True
    if ct in ("text/plain", "text/csv", "text/markdown") or fn.endswith((".txt", ".csv", ".md")):
        return True
    if ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or fn.endswith(".docx"):
        return True
    return False


def build_document_excerpt_for_email_summary(db: Session, email: Email, correlation_id: str) -> str:
    """
    Plain-text excerpts from eligible attachments for one email. Empty string if none.
    """
    gid = (getattr(email, "graph_id", None) or "").strip()
    mbox = (getattr(email, "mailbox_owner_email", None) or "").strip()
    if not gid or not mbox:
        return ""

    atts = (
        db.query(Attachment)
        .filter(Attachment.email_id == email.id, Attachment.graph_attachment_id.isnot(None))
        .order_by(Attachment.name.asc())
        .all()
    )
    blocks: list[str] = []
    total_len = 0
    used = 0

    for att in atts:
        if used >= _MAX_ATTACHMENTS:
            break
        if not _is_summarizable_document(att):
            continue
        sz = att.size
        if sz is not None and sz > _MAX_BYTES_PER_FILE:
            logger.info(
                "summary_attachments: skip large file name=%s size=%s correlation_id=%s",
                (att.name or "")[:80],
                sz,
                correlation_id,
            )
            continue

        data = _fetch_file_attachment_json(mbox, gid, str(att.graph_attachment_id).strip())
        if not data:
            continue
        raw = _decode_graph_file_attachment(data)
        if not raw:
            continue
        if len(raw) > _MAX_BYTES_PER_FILE:
            logger.info(
                "summary_attachments: skip decoded oversized name=%s correlation_id=%s",
                (att.name or "")[:80],
                correlation_id,
            )
            continue

        ct = (att.content_type or data.get("contentType") or "application/octet-stream").split(";")[0].strip()
        excerpt = _extract_bytes_to_plain(raw, ct, att.name or "")
        if not excerpt:
            continue
        header = f"[Attachment: {att.name or 'unnamed'}]"
        block = f"{header}\n{excerpt}".strip()
        if total_len + len(block) + 2 > _MAX_TOTAL_EXCERPT_CHARS:
            remain = _MAX_TOTAL_EXCERPT_CHARS - total_len - 2
            if remain < 200:
                break
            block = block[:remain] + "…"
        blocks.append(block)
        total_len += len(block) + 2
        used += 1

    if not blocks:
        return ""
    return "\n\n".join(blocks).strip()
