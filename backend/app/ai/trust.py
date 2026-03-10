"""
Trust / spam from known senders: evaluate emails for suspicious content, phishing indicators.
Updates sender trust_score; low trust can override classification to Spam.
"""
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Phrases that suggest phishing / suspicious (even from known senders)
SUSPICIOUS_PHRASES = [
    r"\bverify\s+your\s+account\b",
    r"\bconfirm\s+your\s+identity\b",
    r"\bclick\s+here\s+immediately\b",
    r"\bact\s+now\s+or\s+account\s+(will\s+be\s+)?(closed|suspended)\b",
    r"\bpassword\s+expir",
    r"\bunusual\s+activity\b",
    r"\bverify\s+your\s+email\b",
    r"\bconfirm\s+your\s+email\b",
    r"\bwire\s+transfer\b",
    r"\burgent\s+wire\b",
    r"\bbank\s+account\s+details\b",
    r"\bsocial\s+security\s+number\b",
    r"\bssn\b",
    r"\birs\s+refund\b",
    r"\bfree\s+prize\b",
    r"\byou\s+have\s+won\b",
    r"\bclaim\s+now\b",
    r"\bphishing\b",
    r"\bmalicious\s+link\b",
]
# Compiled for reuse
_SUSPICIOUS_PATTERNS = [re.compile(p, re.IGNORECASE) for p in SUSPICIOUS_PHRASES]

# Default trust for new senders (neutral)
DEFAULT_TRUST = 0.7
# Decay when we flag content as suspicious
SUSPICIOUS_DECAY = 0.15
# Minimum trust
MIN_TRUST = 0.0
MAX_TRUST = 1.0


def _normalize_text(s: str | None) -> str:
    if s is None:
        return ""
    return (s or "").strip()


def evaluate_suspicious(subject: str | None, body_preview: str | None, body_content: str | None) -> tuple[bool, list[str]]:
    """
    Check email for suspicious/phishing indicators. Returns (is_suspicious, list of matched reasons).
    """
    combined = " ".join([
        _normalize_text(subject),
        _normalize_text(body_preview),
        (_normalize_text(body_content) or "")[:5000],
    ]).lower()
    if not combined.strip():
        return False, []
    reasons = []
    for pat in _SUSPICIOUS_PATTERNS:
        if pat.search(combined):
            reasons.append(pat.pattern[:50])
    return len(reasons) > 0, reasons


def update_sender_trust(
    current_trust: float | None,
    is_suspicious: bool,
    category_was_spam: bool,
    decay: float = SUSPICIOUS_DECAY,
) -> float:
    """
    Compute new trust score for sender.
    - If content is suspicious: reduce trust by decay.
    - If category is Spam: reduce trust.
    - Otherwise: slight recovery toward DEFAULT_TRUST (optional).
    Returns new score clamped to [MIN_TRUST, MAX_TRUST].
    """
    score = current_trust if current_trust is not None else DEFAULT_TRUST
    if is_suspicious:
        score = max(MIN_TRUST, score - decay)
    if category_was_spam:
        score = max(MIN_TRUST, score - 0.1)
    if not is_suspicious and not category_was_spam and score < DEFAULT_TRUST:
        # Slight recovery
        score = min(MAX_TRUST, score + 0.02)
    return max(MIN_TRUST, min(MAX_TRUST, score))


def should_override_to_spam(trust_score: float | None, min_trust: float) -> bool:
    """Return True if sender trust is below threshold (treat as spam from known sender)."""
    if trust_score is None:
        return False
    return float(trust_score) < min_trust
