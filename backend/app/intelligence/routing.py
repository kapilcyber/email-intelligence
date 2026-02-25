"""
Phase 3: Rule-based and category-based routing.
Assigns team: Sales, Accounts, HR, Tech, General from keywords and AI category.
"""
import re
from typing import Optional

# Keyword rules: (pattern, team). Order matters (first match wins).
ROUTING_RULES = [
    (r"\b(pricing|proposal|demo|quote|sales|contract)\b", "Sales"),
    (r"\b(invoice|payment|po\b|purchase order|accounts? payable|billing)\b", "Accounts"),
    (r"\b(resume|interview|hiring|hr\b|vacation|leave)\b", "HR"),
    (r"\b(server|bug|error|outage|deploy|tech support)\b", "Tech"),
]


def route_email(
    subject: Optional[str],
    body_preview: Optional[str],
    body_content: Optional[str],
    ai_category: Optional[str],
) -> str:
    """
    Returns assigned team: Sales | Accounts | HR | Tech | General.
    Uses keyword rules first, then falls back to AI category mapping.
    """
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
    for pattern, team in ROUTING_RULES:
        if re.search(pattern, text, re.I):
            return team
    # Category -> team mapping
    if ai_category:
        cat = str(ai_category).strip().lower()
        if cat in ("sales",):
            return "Sales"
        if cat in ("accounts",):
            return "Accounts"
        if cat in ("hr",):
            return "HR"
        if cat in ("tech",):
            return "Tech"
    return "General"
