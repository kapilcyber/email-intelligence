"""
Phase 3: Lead detection (sales signals).
Uses simple keyword heuristics; can be extended with AI.
"""
import re
from typing import Optional

# Buying signals -> lead label
LEAD_HOT = re.compile(
    r"\b(demo\s+request|schedule\s+(a\s+)?call|ready\s+to\s+buy|contract|sign\s+now)\b",
    re.I,
)
LEAD_WARM = re.compile(
    r"\b(budget|timeline|pricing|quote|proposal|compare|evaluation)\b",
    re.I,
)
LEAD_COLD = re.compile(
    r"\b(information|brochure|newsletter|subscribe)\b",
    re.I,
)


def detect_lead(
    subject: Optional[str],
    body_preview: Optional[str],
    body_content: Optional[str],
    ai_category: Optional[str],
) -> Optional[str]:
    """
    Returns lead label: Hot | Warm | Cold or None if not a lead.
    Only considers when category is Sales or content has sales signals.
    """
    if ai_category and str(ai_category).strip().lower() != "sales":
        return None
    text = " ".join(
        filter(
            None,
            [
                (subject or ""),
                (body_preview or "")[:500],
                (body_content or "")[:1000],
            ]
        )
    ).lower()
    if LEAD_HOT.search(text):
        return "Hot"
    if LEAD_WARM.search(text):
        return "Warm"
    if LEAD_COLD.search(text):
        return "Cold"
    if ai_category and str(ai_category).strip().lower() == "sales":
        return "Warm"
    return None
