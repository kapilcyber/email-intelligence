"""
Phase 3: Escalation detection via heuristics.
Keywords, sentiment hint, RE: count, thread length.
"""
import re
from typing import Optional


ESCALATION_KEYWORDS = re.compile(
    r"\b(urgent|asap|escalat|unresolved|critical|immediately|emergency)\b",
    re.I,
)


def detect_escalation(
    subject: Optional[str],
    body_preview: Optional[str],
    body_content: Optional[str],
    ai_priority_label: Optional[str],
    re_count: int = 0,
    thread_length: int = 0,
) -> tuple[bool, dict]:
    """
    Returns (is_escalation, metadata_dict).
    metadata can include: reason, thread_length, re_count.
    """
    text = " ".join(
        filter(
            None,
            [
                (subject or ""),
                (body_preview or "")[:500],
                (body_content or "")[:500],
            ]
        )
    )
    reasons = []
    if ESCALATION_KEYWORDS.search(text):
        reasons.append("escalation_keywords")
    if ai_priority_label and str(ai_priority_label).lower() in ("critical", "high"):
        reasons.append("high_priority")
    if re_count >= 3:
        reasons.append("long_thread_re")
    if thread_length >= 5:
        reasons.append("long_thread")
    is_esc = len(reasons) > 0
    meta = {"reasons": reasons, "thread_length": thread_length, "re_count": re_count}
    return is_esc, meta
