"""
Phase 3: Sender trust score update.
Decrease on spam/high-risk; increase on normal important mail.
"""
from typing import Optional


def update_trust_score(
    current_trust: Optional[float],
    is_spam: bool,
    ai_priority_label: Optional[str],
    was_phishing_risk: bool = False,
) -> float:
    """
    Returns new trust score 0-100.
    current_trust: existing sender trust or None -> 50.
    """
    score = 50.0 if current_trust is None else max(0.0, min(100.0, float(current_trust)))
    if was_phishing_risk:
        score -= 25
    if is_spam:
        score -= 15
    if ai_priority_label and str(ai_priority_label).lower() == "spam":
        score -= 10
    if ai_priority_label and str(ai_priority_label).lower() in ("critical", "high"):
        score += 2  # slight bump for important legitimate mail
    return max(0.0, min(100.0, score))
