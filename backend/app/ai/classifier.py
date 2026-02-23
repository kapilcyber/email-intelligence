"""
Phase 2: Email classification via Azure OpenAI.
Produces summary, category, priority score/label, reply suggestions.
With structured JSON enforcement, timeout, retry, and observability.
"""
import json
import logging
import re
import time
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

# Lazy import so workers without OPENAI_API_KEY don't fail at import
_openai_client: Any = None

# Default timeout for OpenAI API call (seconds)
OPENAI_TIMEOUT = 60.0
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2.0


def _get_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        settings = get_settings()
        if not (settings.openai_api_key and settings.openai_api_key.strip()):
            raise ValueError("OPENAI_API_KEY is not set")
        _openai_client = OpenAI(
            api_key=settings.openai_api_key.strip(),
            timeout=OPENAI_TIMEOUT,
        )
    return _openai_client


# Categories and labels from the plan
CATEGORIES = ("Sales", "HR", "Accounts", "Tech", "General", "Spam")
PRIORITY_LABELS = ("Critical", "High", "Medium", "Low", "Spam")


def priority_score_to_label(score: float | None, category: str | None) -> str:
    """
    Map numeric priority score (0-100) and optional category to label.
    Critical / High / Medium / Low / Spam.
    """
    if category and str(category).strip().lower() == "spam":
        return "Spam"
    if score is None:
        return "Medium"
    s = float(score)
    if s >= 90:
        return "Critical"
    if s >= 70:
        return "High"
    if s >= 50:
        return "Medium"
    if s >= 20:
        return "Low"
    return "Spam"


def _escape_for_format(s: str) -> str:
    """Escape braces so user content can be safely used in .format()."""
    if not s:
        return s
    return str(s).replace("{", "{{").replace("}", "}}")


def _build_prompt(subject: str | None, body_preview: str | None, body_content: str | None, sender: str) -> str:
    subject = subject or "(No subject)"
    preview = (body_preview or "")[:500]
    content = (body_content or "")[:3000]
    if not content and preview:
        content = preview
    sender = sender or "unknown"
    example_json = '{"summary": "Meeting follow-up with action items.", "category": "General", "priority_score": 55, "suggested_replies": ["Thanks, I\'ll review and get back by EOD.", "Can we move the call to 3pm?"]}'
    template = """Analyze this email and respond with a single JSON object only. No markdown, no code block, no explanation — only valid JSON.

Email:
From: {sender}
Subject: {subject}

Body (excerpt):
{content}

Respond with exactly this structure (use only these keys):
- "summary": string, 1-2 sentence concise summary.
- "category": one of: Sales, HR, Accounts, Tech, General, Spam
- "priority_score": number 0-100 (importance: 90+ urgent, 70-89 high, 50-69 medium, 20-49 low, 0-19 spam/low value)
- "suggested_replies": array of 1 to 3 short reply options (strings, each one sentence or short phrase)

Example: """
    part1 = template.format(
        sender=_escape_for_format(sender),
        subject=_escape_for_format(subject),
        content=_escape_for_format(content),
    )
    return part1 + example_json


def _parse_json_from_response(text: str, correlation_id: str | None = None) -> dict:
    """Extract JSON from model response (may be wrapped in markdown)."""
    text = (text or "").strip()
    # Remove optional markdown code block
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    # Try to find first { ... } if there's extra text
    if not text.startswith("{"):
        brace = text.find("{")
        if brace >= 0:
            end = text.rfind("}")
            if end > brace:
                text = text[brace : end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(
            "PARSED_SUMMARY: json_parse_failed correlation_id=%s error=%s excerpt=%s",
            correlation_id or "none",
            str(e),
            (text[:200] + "..." if len(text) > 200 else text),
        )
        raise


def _extract_summary_safe(data: dict) -> str | None:
    """Extract summary from parsed data; try 'summary' and 'Summary' for compatibility."""
    raw = data.get("summary") or data.get("Summary")
    if raw is None:
        return None
    s = str(raw).strip()
    return s if s else None


def classify_email_content(
    subject: str | None,
    body_preview: str | None,
    body_content: str | None,
    sender_email: str,
    correlation_id: str | None = None,
) -> dict[str, Any]:
    """
    Call OpenAI to get summary, category, priority_score, suggested_replies.
    Returns dict with keys: summary, category, priority_score, priority_label, suggested_replies, confidence_score (optional).
    On missing key or API error returns safe defaults and does not raise (caller should check summary is None for failure).
    """
    correlation_id = correlation_id or "none"
    settings = get_settings()
    if not (settings.openai_api_key and settings.openai_api_key.strip()):
        logger.info(
            "AI_RESPONSE: skipped_no_api_key correlation_id=%s",
            correlation_id,
        )
        return {
            "summary": None,
            "category": None,
            "priority_score": None,
            "priority_label": "Medium",
            "suggested_replies": [],
            "confidence_score": None,
        }

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            client = _get_client()
            prompt = _build_prompt(subject, body_preview, body_content, sender_email)
            start = time.perf_counter()
            response = client.chat.completions.create(
                model=settings.openai_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=500,
                timeout=OPENAI_TIMEOUT,
            )
            latency_ms = (time.perf_counter() - start) * 1000
            choice = (response.choices or [None])[0]
            message = getattr(choice, "message", None)
            content = getattr(message, "content", None) if message else None
            content = (content or "").strip()

            logger.info(
                "AI_RESPONSE: correlation_id=%s latency_ms=%.0f attempt=%d content_length=%d",
                correlation_id,
                latency_ms,
                attempt + 1,
                len(content),
            )
            if not content:
                logger.warning(
                    "AI_RESPONSE: empty_content correlation_id=%s",
                    correlation_id,
                )
                return {
                    "summary": None,
                    "category": None,
                    "priority_score": 50.0,
                    "priority_label": "Medium",
                    "suggested_replies": [],
                    "confidence_score": None,
                }

            data = _parse_json_from_response(content, correlation_id)
            summary = _extract_summary_safe(data)
            logger.info(
                "PARSED_SUMMARY: correlation_id=%s has_summary=%s summary_len=%s",
                correlation_id,
                summary is not None,
                len(summary) if summary else 0,
            )
            if summary is None and data:
                logger.warning(
                    "PARSED_SUMMARY: summary_missing correlation_id=%s keys=%s",
                    correlation_id,
                    list(data.keys()),
                )

            category = data.get("category")
            if category and category not in CATEGORIES:
                category = "General"
            score = data.get("priority_score")
            if score is not None:
                try:
                    score = float(score)
                except (TypeError, ValueError):
                    score = 50.0
                score = max(0.0, min(100.0, score))
            else:
                score = 50.0
            label = priority_score_to_label(score, category)
            replies = data.get("suggested_replies")
            if not isinstance(replies, list):
                replies = []
            suggested_replies = [str(r).strip() for r in replies[:3] if r]
            confidence = data.get("confidence_score")
            if confidence is not None:
                try:
                    confidence = max(0.0, min(1.0, float(confidence)))
                except (TypeError, ValueError):
                    confidence = None

            return {
                "summary": summary,
                "category": category,
                "priority_score": score,
                "priority_label": label,
                "suggested_replies": suggested_replies,
                "confidence_score": confidence,
            }
        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(
                "AI_RESPONSE: parse_error correlation_id=%s attempt=%d error=%s",
                correlation_id,
                attempt + 1,
                str(e),
            )
        except Exception as e:
            last_error = e
            logger.warning(
                "AI_RESPONSE: api_error correlation_id=%s attempt=%d error=%s",
                correlation_id,
                attempt + 1,
                str(e),
            )
        if attempt < MAX_RETRIES - 1:
            delay = RETRY_BASE_DELAY * (2**attempt)
            logger.info("AI_RESPONSE: retry correlation_id=%s delay=%.1fs", correlation_id, delay)
            time.sleep(delay)

    # All retries failed
    logger.warning(
        "AI_RESPONSE: failed_after_retries correlation_id=%s error=%s",
        correlation_id,
        str(last_error),
    )
    return {
        "summary": None,
        "category": None,
        "priority_score": 50.0,
        "priority_label": "Medium",
        "suggested_replies": [],
        "confidence_score": None,
    }
