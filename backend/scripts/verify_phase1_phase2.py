"""
Verify Phase 1 and Phase 2 APIs and responses.
Run with: python scripts/verify_phase1_phase2.py
Requires: API running at BASE_URL (default http://127.0.0.1:8000).
"""
import os
import sys

# Allow running from backend or repo root
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx")
    sys.exit(1)


def get(path: str, **kwargs):
    r = httpx.get(f"{BASE_URL}{path}", timeout=15.0, **kwargs)
    return r


def post(path: str, json: dict = None, **kwargs):
    r = httpx.post(f"{BASE_URL}{path}", json=json or {}, timeout=15.0, **kwargs)
    return r


def main():
    failed = []
    print("Verifying Phase 1 & Phase 2 at", BASE_URL)
    print("-" * 50)

    # Phase 1 — Health
    try:
        r = get("/api/health")
        assert r.status_code == 200, f"health status {r.status_code}"
        d = r.json()
        assert "status" in d and "services" in d
        assert "database" in d["services"] and "redis" in d["services"]
        print("[PASS] GET /api/health")
    except Exception as e:
        failed.append(("GET /api/health", e))
        print("[FAIL] GET /api/health:", e)

    # Phase 1 — API root
    try:
        r = get("/api")
        assert r.status_code == 200
        assert "health" in r.json()
        print("[PASS] GET /api")
    except Exception as e:
        failed.append(("GET /api", e))
        print("[FAIL] GET /api:", e)

    # Phase 1 — Dashboard metrics
    try:
        r = get("/api/dashboard/metrics")
        assert r.status_code == 200
        d = r.json()
        for key in ("emailsIngestedToday", "queueSize", "activeWorkers", "totalEmails", "totalClassified"):
            assert key in d, f"missing {key}"
        print("[PASS] GET /api/dashboard/metrics")
    except Exception as e:
        failed.append(("GET /api/dashboard/metrics", e))
        print("[FAIL] GET /api/dashboard/metrics:", e)

    # Phase 1 — List emails
    try:
        r = get("/api/emails", params={"page": 1, "pageSize": 5})
        assert r.status_code == 200
        d = r.json()
        assert "emails" in d and "total" in d and "page" in d
        emails = d.get("emails", [])
        if emails:
            e = emails[0]
            for f in ("id", "messageId", "subject", "sender", "receivedAt"):
                assert f in e, f"list email missing {f}"
        print("[PASS] GET /api/emails")
    except Exception as e:
        failed.append(("GET /api/emails", e))
        print("[FAIL] GET /api/emails:", e)

    # Phase 1 — Queue status
    try:
        r = get("/api/queue/status")
        assert r.status_code == 200
        d = r.json()
        assert "pending" in d
        print("[PASS] GET /api/queue/status")
    except Exception as e:
        failed.append(("GET /api/queue/status", e))
        print("[FAIL] GET /api/queue/status:", e)

    # Phase 1 — Webhook status
    try:
        r = get("/api/webhook/status")
        assert r.status_code == 200
        d = r.json()
        assert "status" in d
        print("[PASS] GET /api/webhook/status")
    except Exception as e:
        failed.append(("GET /api/webhook/status", e))
        print("[FAIL] GET /api/webhook/status:", e)

    # Phase 2 — System health
    try:
        r = get("/api/system/health")
        assert r.status_code == 200
        d = r.json()
        assert "webhookStatus" in d
        print("[PASS] GET /api/system/health")
    except Exception as e:
        failed.append(("GET /api/system/health", e))
        print("[FAIL] GET /api/system/health:", e)

    # Phase 2 — List emails with AI fields
    try:
        r = get("/api/emails", params={"page": 1, "pageSize": 3})
        assert r.status_code == 200
        d = r.json()
        for e in d.get("emails", []):
            for f in ("summary", "category", "priorityLabel", "aiStatus"):
                if f not in e:
                    raise AssertionError(f"list email missing AI field {f}")
            break
        print("[PASS] GET /api/emails (Phase 2 AI fields)")
    except Exception as e:
        failed.append(("GET /api/emails AI fields", e))
        print("[FAIL] GET /api/emails (AI fields):", e)

    # Phase 2 — Email detail (if we have an email)
    try:
        r = get("/api/emails", params={"page": 1, "pageSize": 1})
        assert r.status_code == 200
        emails = r.json().get("emails", [])
        if emails:
            eid = emails[0]["id"]
            r2 = get(f"/api/emails/{eid}")
            assert r2.status_code == 200
            det = r2.json()
            for f in ("summary", "category", "priorityLabel", "suggestedReplies", "aiStatus", "aiErrorMessage"):
                assert f in det, f"detail missing {f}"
            print("[PASS] GET /api/emails/:id (Phase 2 detail)")
        else:
            print("[SKIP] GET /api/emails/:id (no emails)")
    except Exception as e:
        failed.append(("GET /api/emails/:id", e))
        print("[FAIL] GET /api/emails/:id:", e)

    # Phase 1 — Backfill (check endpoint; 400 if user_id/mailbox missing, 200 if enqueued)
    try:
        r = post("/api/emails/backfill", json={"days": 1})
        assert r.status_code in (200, 400), f"backfill status {r.status_code}"
        if r.status_code == 200:
            assert "ok" in r.json() and "taskId" in r.json()
        print("[PASS] POST /api/emails/backfill (endpoint reachable)")
    except Exception as e:
        failed.append(("POST /api/emails/backfill", e))
        print("[FAIL] POST /api/emails/backfill:", e)

    # Phase 2 — Classify backfill (check endpoint; 400 if no OPENAI_API_KEY, 200 if enqueued)
    try:
        r = post("/api/emails/classify-backfill", json={})
        assert r.status_code in (200, 400), f"classify-backfill status {r.status_code}"
        if r.status_code == 200:
            assert "ok" in r.json() and "taskId" in r.json()
        print("[PASS] POST /api/emails/classify-backfill (endpoint reachable)")
    except Exception as e:
        failed.append(("POST /api/emails/classify-backfill", e))
        print("[FAIL] POST /api/emails/classify-backfill:", e)

    # Phase 2 — Retry AI (check endpoint with first email id)
    try:
        r = get("/api/emails", params={"page": 1, "pageSize": 1})
        assert r.status_code == 200
        emails = r.json().get("emails", [])
        if emails:
            eid = emails[0]["id"]
            r2 = post(f"/api/emails/{eid}/retry-ai")
            assert r2.status_code == 200
            assert r2.json().get("ok") is True
            print("[PASS] POST /api/emails/:id/retry-ai")
        else:
            print("[SKIP] POST /api/emails/:id/retry-ai (no emails)")
    except Exception as e:
        failed.append(("POST /api/emails/:id/retry-ai", e))
        print("[FAIL] POST /api/emails/:id/retry-ai:", e)

    # Phase 3 — Escalations / leads
    try:
        r = get("/api/escalations", params={"page": 1, "pageSize": 5})
        assert r.status_code == 200
        assert "escalations" in r.json()
        print("[PASS] GET /api/escalations")
    except Exception as e:
        failed.append(("GET /api/escalations", e))
        print("[FAIL] GET /api/escalations:", e)

    try:
        r = get("/api/leads", params={"page": 1, "pageSize": 5})
        assert r.status_code == 200
        assert "leads" in r.json()
        print("[PASS] GET /api/leads")
    except Exception as e:
        failed.append(("GET /api/leads", e))
        print("[FAIL] GET /api/leads:", e)

    # Settings
    try:
        r = get("/api/settings")
        assert r.status_code == 200
        print("[PASS] GET /api/settings")
    except Exception as e:
        failed.append(("GET /api/settings", e))
        print("[FAIL] GET /api/settings:", e)

    print("-" * 50)
    if failed:
        print("FAILED:", len(failed))
        for name, err in failed:
            print("  -", name, ":", err)
        sys.exit(1)
    print("All checks passed. Phase 1 & Phase 2 APIs are working.")
    sys.exit(0)


if __name__ == "__main__":
    main()
