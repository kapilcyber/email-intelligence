"""
Phase 2: Email classification via OpenAI (primary) and Ollama (fallback).
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

_openai_client: Any = None
_ollama_client: Any = None

OPENAI_TIMEOUT = 90.0
OLLAMA_MAX_RETRIES = 2
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2.0
# Enough tokens for full JSON; avoids truncation mid-string (e.g. in suggested_replies)
MAX_TOKENS_RESPONSE = 1024


def _get_openai_client():
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


def _get_ollama_client():
    global _ollama_client
    if _ollama_client is None:
        from openai import OpenAI
        settings = get_settings()
        if not (settings.ollama_base_url and settings.ollama_base_url.strip()):
            raise ValueError("OLLAMA_BASE_URL is not set")
        _ollama_client = OpenAI(
            base_url=settings.ollama_base_url.strip(),
            api_key="ollama",
            timeout=OPENAI_TIMEOUT,
        )
    return _ollama_client


def _call_llm(client: Any, model: str, prompt: str, timeout: float = OPENAI_TIMEOUT) -> str:
    """Call chat completions; returns content string or raises."""
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=MAX_TOKENS_RESPONSE,
        timeout=timeout,
    )
    choice = (response.choices or [None])[0]
    message = getattr(choice, "message", None)
    content = getattr(message, "content", None) if message else None
    return (content or "").strip()


# Categories and labels from the plan
CATEGORIES = ("Sales", "HR", "Accounts", "Tech", "General", "Spam")
PRIORITY_LABELS = ("Critical", "High", "Medium", "Low", "Spam")
# Lead labels and buying signals (for sales lead detection)
LEAD_LABELS = ("Hot", "Warm", "Cold")
BUYING_SIGNAL_VALUES = ("demo_request", "budget_discussion", "timeline_mention", "product_comparison")


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
    example_json = '{"summary": "Meeting follow-up with action items.", "category": "General", "priority_score": 55, "suggested_replies": ["Thanks, will review by EOD.", "Can we move to 3pm?"], "lead_label": null, "buying_signals": []}'
    template = """Analyze this email and respond with a single JSON object only. No markdown, no code block, no explanation. Output only valid JSON.

Email:
From: {sender}
Subject: {subject}

Body (excerpt):
{content}

Respond with exactly this structure (only these keys):
- "summary": one or two short sentences summarizing the email.
- "category": exactly one of: Sales, HR, Accounts, Tech, General, Spam
- "priority_score": number 0-100 (90+ urgent, 70-89 high, 50-69 medium, 20-49 low, 0-19 spam)
- "suggested_replies": array of 1 to 3 very short reply phrases. Use simple words; avoid quotes or apostrophes inside the strings so the JSON stays valid.
- "lead_label": only for sales-related emails, one of: Hot, Warm, Cold. Use null if not a sales lead. Hot = strong buying intent (e.g. demo request, budget/timeline discussed). Warm = some interest (e.g. product comparison, general inquiry). Cold = minimal or no buying signals.
- "buying_signals": array of zero or more of exactly: demo_request, budget_discussion, timeline_mention, product_comparison. Use when the email mentions: demo/trial requests, budget/pricing discussion, timeline/deadline, or product comparison. Empty array if none.

Example: """
    part1 = template.format(
        sender=_escape_for_format(sender),
        subject=_escape_for_format(subject),
        content=_escape_for_format(content),
    )
    return part1 + example_json


def _normalize_json_text(text: str) -> str:
    """Extract JSON-like substring from model output (markdown, extra text)."""
    text = (text or "").strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    if not text.startswith("{"):
        brace = text.find("{")
        if brace >= 0:
            end = text.rfind("}")
            if end > brace:
                text = text[brace : end + 1]
    return text


def _repair_json_string(s: str) -> str:
    """Apply common repairs to reduce JSON parse failures."""
    if not s or not s.strip():
        return s
    # Remove trailing comma before ] or }
    s = re.sub(r",\s*([}\]])", r"\1", s)
    # Truncate at first control character that might break parsing
    s = "".join(c for c in s if c >= " " or c in "\n\r\t")
    return s


def _try_parse_json_strict(text: str) -> dict | None:
    """Try standard json.loads; returns None on failure."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _try_parse_json_relaxed(text: str) -> dict | None:
    """Try parsing with repairs (trailing commas, strip control chars)."""
    repaired = _repair_json_string(text)
    return _try_parse_json_strict(repaired)


def _extract_fields_via_regex(text: str) -> dict | None:
    """Best-effort extraction of summary, category, priority_score from raw text."""
    out: dict[str, Any] = {}
    # "summary": "..."  (allow escaped quotes inside)
    m = re.search(r'"summary"\s*:\s*"((?:[^"\\]|\\.)*)"', text)
    if m:
        out["summary"] = m.group(1).replace("\\\"", '"').strip()
    # "category": "X"
    m = re.search(r'"category"\s*:\s*"([^"]+)"', text)
    if m:
        out["category"] = m.group(1).strip()
    # "priority_score": number
    m = re.search(r'"priority_score"\s*:\s*(\d+(?:\.\d+)?)', text)
    if m:
        try:
            out["priority_score"] = float(m.group(1))
        except ValueError:
            pass
    # suggested_replies: collect "[...]" (or truncated array content)
    m = re.search(r'"suggested_replies"\s*:\s*\[(.*?)\]', text, re.DOTALL)
    if not m:
        m = re.search(r'"suggested_replies"\s*:\s*\[(.*)', text, re.DOTALL)
    if m:
        inner = m.group(1)
        replies = re.findall(r'"((?:[^"\\]|\\.)*)"', inner)
        if replies:
            out["suggested_replies"] = [r.replace('\\"', '"').strip() for r in replies[:3] if r.strip()]
    # lead_label: "Hot" | "Warm" | "Cold" | null
    m = re.search(r'"lead_label"\s*:\s*(?:"(Hot|Warm|Cold)"|null)', text, re.IGNORECASE)
    if m:
        out["lead_label"] = m.group(1) if m.lastindex and m.group(1) else None
    # buying_signals: ["demo_request", ...]
    m = re.search(r'"buying_signals"\s*:\s*\[(.*?)\]', text, re.DOTALL)
    if m:
        inner = m.group(1)
        signals = re.findall(r'"(demo_request|budget_discussion|timeline_mention|product_comparison)"', inner)
        out["buying_signals"] = list(dict.fromkeys(signals))  # dedupe, preserve order
    if out:
        return out
    return None


def _parse_json_from_response(text: str, correlation_id: str | None = None) -> dict:
    """
    Extract JSON from model response. Tries strict parse, then relaxed (repairs),
    then regex fallback. Returns dict with at least summary/category/priority_score
    where possible; raises only if nothing could be extracted.
    """
    cid = correlation_id or "none"
    normalized = _normalize_json_text(text)

    data = _try_parse_json_strict(normalized)
    if data is not None:
        return data

    data = _try_parse_json_relaxed(normalized)
    if data is not None:
        logger.info("PARSED_SUMMARY: used_relaxed_parse correlation_id=%s", cid)
        return data

    fallback = _extract_fields_via_regex(normalized)
    if fallback is not None:
        logger.info("PARSED_SUMMARY: used_regex_fallback correlation_id=%s keys=%s", cid, list(fallback.keys()))
        return fallback

    logger.warning(
        "PARSED_SUMMARY: json_parse_failed correlation_id=%s excerpt=%s",
        cid,
        (normalized[:200] + "..." if len(normalized) > 200 else normalized),
    )
    raise ValueError("Could not extract valid JSON or fields from model response")


def _extract_summary_safe(data: dict) -> str | None:
    """Extract summary from parsed data; try 'summary' and 'Summary' for compatibility."""
    raw = data.get("summary") or data.get("Summary")
    if raw is None:
        return None
    s = str(raw).strip()
    return s if s else None


def _normalize_category(category: Any) -> str | None:
    """Return a valid category from plan, or None/General."""
    if category is None:
        return None
    s = str(category).strip()
    if not s:
        return None
    for c in CATEGORIES:
        if c.lower() == s.lower():
            return c
    return "General"


def _normalize_lead_label(lead_label: Any) -> str | None:
    """Return Hot, Warm, or Cold if valid; else None."""
    if lead_label is None:
        return None
    s = str(lead_label).strip()
    if not s or s.lower() == "null":
        return None
    for L in LEAD_LABELS:
        if L.lower() == s.lower():
            return L
    return None


def _normalize_buying_signals(signals: Any) -> list[str]:
    """Return list of valid buying signal strings only."""
    if not signals or not isinstance(signals, list):
        return []
    out = []
    seen = set()
    for x in signals:
        s = (str(x).strip().lower() if x is not None else "")
        if s in BUYING_SIGNAL_VALUES and s not in seen:
            out.append(s)
            seen.add(s)
    return out


def _content_to_result(content: str, correlation_id: str | None = None) -> dict[str, Any]:
    """Parse LLM content to JSON and build the standard result dict. Raises only if no content or parse completely fails."""
    if not (content or content.strip()):
        raise ValueError("Empty content")
    data = _parse_json_from_response(content, correlation_id)
    summary = _extract_summary_safe(data)
    category = _normalize_category(data.get("category") or data.get("Category")) or "General"
    score = data.get("priority_score") or data.get("priorityScore")
    if score is not None:
        try:
            score = float(score)
        except (TypeError, ValueError):
            score = 50.0
        score = max(0.0, min(100.0, score))
    else:
        score = 50.0
    label = priority_score_to_label(score, category)
    replies = data.get("suggested_replies") or data.get("suggestedReplies")
    if not isinstance(replies, list):
        replies = []
    suggested_replies = [str(r).strip() for r in replies[:3] if r is not None and str(r).strip()]
    confidence = data.get("confidence_score")
    if confidence is not None:
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = None
    lead_label = _normalize_lead_label(data.get("lead_label") or data.get("leadLabel"))
    buying_signals = _normalize_buying_signals(data.get("buying_signals") or data.get("buyingSignals"))
    return {
        "summary": summary,
        "category": category,
        "priority_score": score,
        "priority_label": label,
        "suggested_replies": suggested_replies,
        "confidence_score": confidence,
        "lead_label": lead_label,
        "buying_signals": buying_signals,
    }


def _failure_dict() -> dict[str, Any]:
    """Standard dict returned when classification fails."""
    return {
        "summary": None,
        "category": None,
        "priority_score": 50.0,
        "priority_label": "Medium",
        "suggested_replies": [],
        "confidence_score": None,
        "lead_label": None,
        "buying_signals": [],
    }


def classify_email_content(
    subject: str | None,
    body_preview: str | None,
    body_content: str | None,
    sender_email: str,
    correlation_id: str | None = None,
) -> dict[str, Any]:
    """
    Call OpenAI (primary) or Ollama (fallback) for summary, category, priority_score, suggested_replies.
    Returns dict with keys: summary, category, priority_score, priority_label, suggested_replies, confidence_score (optional).
    On missing key or API error returns safe defaults and does not raise (caller should check summary is None for failure).
    """
    correlation_id = correlation_id or "none"
    settings = get_settings()
    prompt = _build_prompt(subject, body_preview, body_content, sender_email)
    use_openai = bool(settings.openai_api_key and settings.openai_api_key.strip())
    use_ollama = bool(settings.ollama_base_url and settings.ollama_base_url.strip())

    if not use_openai and not use_ollama:
        logger.info("AI_RESPONSE: skipped_no_provider correlation_id=%s", correlation_id)
        return _failure_dict()

    # Try OpenAI first if configured
    if use_openai:
        last_openai_error: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                client = _get_openai_client()
                start = time.perf_counter()
                content = _call_llm(client, settings.openai_model, prompt)
                latency_ms = (time.perf_counter() - start) * 1000
                if not content:
                    raise ValueError("OpenAI returned empty content")
                result = _content_to_result(content, correlation_id)
                logger.info(
                    "AI_RESPONSE: provider=openai correlation_id=%s latency_ms=%.0f attempt=%d content_length=%d",
                    correlation_id,
                    latency_ms,
                    attempt + 1,
                    len(content),
                )
                return result
            except Exception as e:
                last_openai_error = e
                logger.warning(
                    "AI_RESPONSE: openai_error correlation_id=%s attempt=%d error=%s",
                    correlation_id,
                    attempt + 1,
                    str(e),
                )
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_BASE_DELAY * (2**attempt)
                    logger.info("AI_RESPONSE: openai_retry correlation_id=%s delay=%.1fs", correlation_id, delay)
                    time.sleep(delay)
        logger.info(
            "AI_RESPONSE: openai_failed_fallback correlation_id=%s error=%s",
            correlation_id,
            str(last_openai_error),
        )

    # Fallback to Ollama if configured
    if use_ollama:
        last_ollama_error: Exception | None = None
        for attempt in range(OLLAMA_MAX_RETRIES):
            try:
                client = _get_ollama_client()
                start = time.perf_counter()
                content = _call_llm(client, settings.ollama_model, prompt)
                latency_ms = (time.perf_counter() - start) * 1000
                if not content:
                    raise ValueError("Ollama returned empty content")
                result = _content_to_result(content, correlation_id)
                logger.info(
                    "AI_RESPONSE: provider=ollama fallback=True correlation_id=%s latency_ms=%.0f attempt=%d content_length=%d",
                    correlation_id,
                    latency_ms,
                    attempt + 1,
                    len(content),
                )
                return result
            except Exception as e:
                last_ollama_error = e
                logger.warning(
                    "AI_RESPONSE: ollama_error correlation_id=%s attempt=%d error=%s",
                    correlation_id,
                    attempt + 1,
                    str(e),
                )
                if attempt < OLLAMA_MAX_RETRIES - 1:
                    delay = RETRY_BASE_DELAY * (2**attempt)
                    logger.info("AI_RESPONSE: ollama_retry correlation_id=%s delay=%.1fs", correlation_id, delay)
                    time.sleep(delay)
        logger.warning(
            "AI_RESPONSE: ollama_failed_after_retries correlation_id=%s error=%s",
            correlation_id,
            str(last_ollama_error),
        )

    return _failure_dict()
