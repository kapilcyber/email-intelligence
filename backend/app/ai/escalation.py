"""
Enterprise escalation detection: keywords, RE chains, CC to seniors, thread length, negative tone.
Combined with AI priority (Critical/High) to set is_escalation and store reasons for audit.
"""
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Default escalation keywords (subject + body)
DEFAULT_ESCALATION_KEYWORDS = [
    "urgent", "unresolved", "escalation", "escalate", "asap", "critical",
    "immediate", "emergency", "priority", "time-sensitive", "asap",
]
# Negative sentiment / tone keywords that suggest escalation
DEFAULT_NEGATIVE_TONE_KEYWORDS = [
    "frustrated", "unhappy", "disappointed", "failed", "unsatisfied",
    "complaint", "complaining", "unacceptable", "unresolved", "still waiting",
]

# Thresholds (overridable via config)
DEFAULT_RE_THRESHOLD = 3  # RE:RE:RE or more in subject
DEFAULT_CC_SENIOR_MIN = 2  # Min CC'd senior authorities to trigger
DEFAULT_THREAD_LENGTH_THRESHOLD = 5  # Messages in thread


def _normalize_text(s: str | None) -> str:
    if s is None:
        return ""
    return (s or "").strip().lower()


def _count_re_in_subject(subject: str | None) -> int:
    """Count RE: (or Re:, re:) occurrences in subject to detect reply chains."""
    if not subject or not subject.strip():
        return 0
    s = subject.strip()
    # Match "Re:" or "RE:" (case-insensitive) as whole tokens
    matches = re.findall(r"\bre\s*:\s*", s, re.IGNORECASE)
    return len(matches)


def _keyword_match(text: str, keywords: list[str]) -> bool:
    """True if any keyword appears as a word in text."""
    if not text or not keywords:
        return False
    norm = _normalize_text(text)
    for kw in keywords:
        if not kw:
            continue
        # Word boundary match
        if re.search(r"\b" + re.escape(kw) + r"\b", norm):
            return True
    return False


def _get_cc_emails(cc_recipients: Any) -> list[str]:
    """Extract email addresses from cc_recipients (list of {email, name})."""
    out = []
    for r in (cc_recipients or []):
        if isinstance(r, dict) and r.get("email"):
            out.append(str(r["email"]).strip().lower())
        elif isinstance(r, str):
            out.append(r.strip().lower())
    return [e for e in out if e and "@" in e]


def _count_senior_cc(cc_emails: list[str], senior_emails: set[str], senior_domains: set[str]) -> int:
    """Count how many CC'd addresses are in senior list or senior domains."""
    count = 0
    for addr in cc_emails:
        if addr in senior_emails:
            count += 1
            continue
        domain = addr.split("@")[-1] if "@" in addr else ""
        if domain and domain in senior_domains:
            count += 1
    return count


def compute_escalation(
    *,
    subject: str | None = None,
    body_preview: str | None = None,
    body_content: str | None = None,
    cc_recipients: Any = None,
    conversation_id: str | None = None,
    ai_priority_label: str | None = None,
    thread_message_count: int | None = None,
    escalation_keywords: list[str] | None = None,
    negative_tone_keywords: list[str] | None = None,
    re_threshold: int = DEFAULT_RE_THRESHOLD,
    cc_senior_min: int = DEFAULT_CC_SENIOR_MIN,
    thread_length_threshold: int = DEFAULT_THREAD_LENGTH_THRESHOLD,
    senior_authority_emails: list[str] | None = None,
    senior_authority_domains: list[str] | None = None,
) -> tuple[bool, list[str]]:
    """
    Compute whether the email should be flagged as escalation and the list of reasons.
    Returns (is_escalation, reasons).
    """
    reasons: list[str] = []
    keywords = escalation_keywords or DEFAULT_ESCALATION_KEYWORDS
    neg_keywords = negative_tone_keywords or DEFAULT_NEGATIVE_TONE_KEYWORDS
    senior_emails = {e.strip().lower() for e in (senior_authority_emails or []) if e and "@" in e.strip()}
    senior_domains = {d.strip().lower() for d in (senior_authority_domains or []) if d and "." in d.strip()}

    combined_text = " ".join([
        _normalize_text(subject),
        _normalize_text(body_preview),
        (_normalize_text(body_content) or "")[:5000],
    ])

    # 1) AI priority Critical/High
    if ai_priority_label and str(ai_priority_label).strip() in ("Critical", "High"):
        reasons.append("priority_high")

    # 2) Escalation keywords
    if _keyword_match(combined_text, keywords):
        reasons.append("keywords")

    # 3) Negative sentiment / tone
    if _keyword_match(combined_text, neg_keywords):
        reasons.append("negative_tone")

    # 4) RE chain (subject)
    re_count = _count_re_in_subject(subject)
    if re_count >= re_threshold:
        reasons.append("re_chain")

    # 5) Multiple CC to senior authorities
    cc_emails = _get_cc_emails(cc_recipients)
    if senior_emails or senior_domains:
        senior_cc = _count_senior_cc(cc_emails, senior_emails, senior_domains)
        if senior_cc >= cc_senior_min:
            reasons.append("cc_senior")

    # 6) Thread length
    if thread_message_count is not None and thread_message_count >= thread_length_threshold:
        reasons.append("thread_length")

    is_escalation = len(reasons) > 0
    return is_escalation, reasons
