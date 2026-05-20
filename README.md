# Email Intelligence — Full Project Guide

End-to-end documentation for the **Email Intelligence** stack: Microsoft Graph mail ingestion, PostgreSQL storage, Redis/Celery workers, LLM-based classification, escalations and leads, and a Next.js operations dashboard with Azure AD sign-in.

For focused setup details, see also:

- [`backend/README.md`](backend/README.md) — Python env, Alembic, Celery, Phase 1–2 API tables, troubleshooting
- [`email-dashboard/README.md`](email-dashboard/README.md) — Next.js routes, mock vs real API, UI stack
- [`outlook-addin/README.md`](outlook-addin/README.md) — internal Outlook add-in (launcher) for the dashboard; build, sideload, centralized deployment

---

## What this system does

1. **Ingests** mail from **Microsoft Graph** (real-time webhooks and/or historical backfill).
2. **Persists** messages, attachments metadata, and senders in **PostgreSQL**.
3. **Processes** asynchronously with **Redis** and **Celery** (ingest → classify pipeline).
4. **Classifies** with **LLMs**: **Ollama** — summary, category, priority, suggested replies, lead signals.
5. **Applies** enterprise rules: **escalation** detection, **sender trust** / spam overrides, optional **sales lead** and **daily summary** webhooks, **team routing** from category.
6. **Exposes** a **FastAPI** backend and a **Next.js** dashboard; API calls from the dashboard send **`X-User-Email`** (and related headers) from the signed-in user.

---

## Architecture

```mermaid
flowchart LR
  subgraph graph [Microsoft Graph]
    Mail[Mailbox]
  end
  subgraph api [FastAPI]
    WH["/api/webhook/notify"]
    REST[REST APIs]
  end
  subgraph workers [Celery + Redis]
    Ingest[ingest_email_task]
    Classify[classify_email_task]
  end
  subgraph data [PostgreSQL]
    DB[(emails, senders, teams, users, ...)]
  end
  subgraph llm [AI]
    Ollama[Ollama]
  end
  subgraph ui [Next.js dashboard]
    Dash[App + X-User-Email]
  end
  Mail -->|change notifications| WH
  WH --> Ingest
  Ingest -->|GET message + attachments| graph
  Ingest --> DB
  Ingest --> Classify
  Classify --> Ollama
  Classify --> DB
  REST --> DB
  Dash --> REST
```

---

## End-to-end data workflow

### 1. Configuration (`backend/app/config.py` / `.env`)

Typical variables:

| Area | Purpose |
|------|---------|
| **Azure / Graph** | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — app auth to Graph; dashboard uses Azure AD separately for users |
| **Database** | `DATABASE_URL` or `POSTGRES_*` |
| **Redis** | `REDIS_URL` — Celery broker/backend and small metrics (e.g. last webhook time, AI latency samples) |
| **Public URL** | `WEBHOOK_BASE_URL` — required for Graph to reach `.../api/webhook/notify` |
| **AI** | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| **Escalation** | `ESCALATION_*`, `SENIOR_AUTHORITY_EMAILS`, `SENIOR_AUTHORITY_DOMAINS`, optional `ESCALATION_KEYWORDS` |
| **Notifications** | `SALES_LEAD_WEBHOOK_URL`, `SALES_NOTIFICATION_EMAILS`, `NOTIFY_SALES_ON_LEAD`, `DAILY_SUMMARY_*` |
| **Trust** | `SENDER_TRUST_ENABLED`, `SENDER_TRUST_MIN_SCORE` |
| **Admin** | `ADMIN_EMAILS` — comma-separated; also `User.role` in DB can grant Admin/Manager |

Copy `backend/.env.example` to `backend/.env` and edit. Run **`alembic upgrade head`** from `backend` for schema (see backend README).

### 2. Real-time path: Graph subscription → webhook → queue

1. **Subscribe** to inbox changes: `POST /api/webhook/subscribe` with body `{"user_id": "<Graph user id or UPN>"}`.  
   Implementation: `backend/app/graph/webhook.py` creates a subscription whose **notification URL** is `{WEBHOOK_BASE_URL}/api/webhook/notify`.

2. **Validation**: Graph calls the notify endpoint with `validationToken`; the API must return that token as **plain text** (`backend/app/api/webhook.py`).

3. **Notifications**: Graph POSTs JSON. For each notification, the API records a timestamp in Redis and calls **`enqueue_ingest_email_task(resource, graph_id)`** (`app/workers/tasks.py`).

### 3. Celery: `ingest_email_task`

- Resolves mailbox **user id** from the Graph resource path.
- **GET**s the full message from Graph (with attachments expanded).
- **Dedupes** on `message_id` + `mailbox_owner_email`.
- Inserts **Email**, **Attachment** rows, ensures **Sender**, sets processing/`status` fields.
- Enqueues **`classify_email_task`** for the new email id.
- Per-mailbox queue counters are updated via `user_queue` helpers for observability.

### 4. Celery: `classify_email_task` (AI + Phase 3 logic)

- Calls **`classify_email_content`** in `backend/app/ai/classifier.py`: structured JSON (summary, category, priority, suggested replies, lead-related fields, etc.) via **Ollama**.
- Persists AI columns; sets `ai_status` / `processing_status` to success or **failed** with retries.
- **Escalation** (`app/ai/escalation.py`): rules using subject/body, CC lists, thread length, AI priority, configurable thresholds → `is_escalation`, metadata, **EscalationThread** updates.
- **Leads**: `lead_label` (Hot/Warm/Cold), `lead_metadata` (e.g. buying signals).
- **Routing**: maps AI category → `assigned_team` (skipped if the email was **retagged** by a user).
- **Sender trust** (`app/ai/trust.py`): may force Spam when trust is below threshold.
- If a lead is configured and webhooks are enabled, **`notify_sales_lead_task`** POSTs to `SALES_LEAD_WEBHOOK_URL`.

### 5. Historical sync (backfill)

- **`backfill_emails_task`**: pages Graph for a folder (`inbox`, `sentitems`, etc.) over a date range or last N days, enqueuing the same **ingest** path as webhooks.  
- HTTP entry: **`POST /api/emails/backfill`** (see backend README for body shape).

### 6. Daily summary (optional)

- **`generate_daily_summary_task`**: per-mailbox aggregates for a calendar day, stored in **daily_summaries**, optional POST to **`DAILY_SUMMARY_WEBHOOK_URL`**.

### 7. Observability

- **`GET /api/system/health`**: webhook subscription state, last webhook time, average AI latency (Redis), queue backlog/active counts.
- **`GET /api/queue/status`**: global queue/worker stats; per-user variants exist where implemented for mailbox-scoped backlog.

---

## Backend API surface (`backend/app/main.py`)

Routers include:

| Prefix / area | Role |
|---------------|------|
| `/api/health` | Liveness and dependency checks |
| `/api/webhook` | Subscription status, **notify** (Graph), **subscribe** |
| `/api/emails`, `/api/dashboard`, `/api/queue`, `/api/settings` | Phase 1-style monitoring and email listing |
| `/api/system` | Extended health (webhook, AI latency, queue) |
| `/api/me`, `/api/me/logout`, … | Current user upsert, sessions, role promotion banner |
| `/api/phase3` | Escalations, leads, team routing, filtered lists |
| `/api/admin/*`, `/api/mom/*` | Admin tracker, review, team oversight |

Authenticated dashboard traffic uses **`X-User-Email`** (required where noted); admin/manager routes use **`get_admin_user`** / **`get_admin_or_manager_user`** (`app/api/deps.py`).

Interactive docs: run the API and open **`http://localhost:8000/docs`**.

---

## Frontend (`email-dashboard`)

- **Stack**: Next.js (App Router), TypeScript, Tailwind, ShadCN-style components, Recharts, Azure AD via **NextAuth** (`lib/auth.ts`). Delegated scopes include **Mail.Send** for sending from the user’s mailbox where implemented.
- **API**: Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local` so `lib/api/client.ts` calls the real backend; if unset, mock routes under `app/api/` are used.
- **Routes** (see dashboard README): e.g. `/dashboard`, `/emails`, `/webhook`, `/queue`, `/settings`, plus admin/follow-up/team flows as implemented in `app/(dashboard)/`.

---

## Quick start (full stack)

**Terminal 1 — backend**

```bash
cd backend
python -m pip install -r requirements.txt
# Ensure PostgreSQL + Redis; alembic upgrade head; .env configured
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Celery worker**

```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info
```

**Terminal 3 — dashboard**

```bash
cd email-dashboard
npm install
npm run dev
```

Open the dashboard at [http://localhost:3001](http://localhost:3001). API: [http://localhost:8000](http://localhost:8000).

**First data**: with worker running, call **`POST /api/emails/backfill`** with your mailbox `user_id` (see backend README). For ongoing new mail, configure **`WEBHOOK_BASE_URL`** and **`POST /api/webhook/subscribe`**.

---

## Repository layout

```
email-intelligence/
  README.md                 ← this file
  outlook-addin/            # Outlook launcher add-in (manifest + static task pane)
  backend/
    app/
      main.py               # FastAPI app, route includes, /api/me
      config.py             # Pydantic settings from env
      api/                  # health, webhook, emails, dashboard, queue, settings, system, phase3, admin, ...
      db/                   # SQLAlchemy session, models
      graph/                # auth, webhook subscribe/renew
      workers/              # celery_app, tasks (ingest, classify, backfill, notify, daily summary)
      ai/                   # classifier, escalation, trust
    alembic/                # migrations
    scripts/                # db helpers, seeds, column adds
  email-dashboard/
    app/                    # pages, layouts, optional mock API routes
    lib/                    # api client, auth, types
```

---

## Related collateral

Other files in the parent workspace (for example presentation decks about bid or RFP intelligence) describe **product narrative** separately; this repository implements **operational email intelligence** as described above.

---

## License / ownership

Internal / project-specific; refer to your organization’s policies for distribution and deployment.
