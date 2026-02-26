# Email Intelligence — Backend

FastAPI backend for email ingestion (Phase 1) and AI classification (Phase 2): Microsoft Graph, Redis/Celery, PostgreSQL, OpenAI.

## Phase 1 deliverables

- **Infrastructure:** FastAPI app, health checks, config (Tenant ID, Client ID, Client Secret)
- **PostgreSQL:** `emails`, `attachments`, `senders` tables and indexes
- **Redis + Celery:** Worker pool, ingest task, retry/backoff
- **Microsoft Graph:** OAuth2 client credentials, token cache, list/read messages
- **Webhooks:** Graph change notifications (subscribe, validate), on event → enqueue ingest
- **Ingestion:** Celery task: fetch from Graph → parse → upsert DB, idempotency by `message_id`
- **Optional:** Backfill task for historical sync

## Setup

1. **Python 3.10+**  
   If `python` works but `pip` is not recognized, use **`python -m pip`** instead of `pip`.  
   If you get **"No module named pip"**, install pip first (from the `backend` folder):
   ```bat
   python -m ensurepip --upgrade
   ```
   Then run `python -m pip install -r requirements.txt` (or run `install.bat`).

2. **Install dependencies**

   **Quick start (when `python` works):**  
   From the `backend` folder run **`install.bat`**, or:
   ```bat
   python -m pip install -r requirements.txt
   ```
   Then run the API (see Run below). No venv required for a quick run.

   **Option A — Windows with venv (recommended):**
   ```bat
   cd backend
   setup.bat
   ```
   Then start the API with `run.bat`.

   **Option B — Manual with venv:**
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   python -m pip install -r requirements.txt
   ```
   Use `python -m pip` if `pip` is not on PATH.

3. **PostgreSQL & Redis**
   - **With DB:** Ensure PostgreSQL is running (e.g. pgAdmin 4). Create the app database once: from the `backend` folder run **`python scripts/create_db.py`** (uses `.env` credentials). Or in pgAdmin: right‑click **Databases → Create → Database**, name it `email_intelligence`. Set `DATABASE_URL` or `POSTGRES_*` in `.env`.
   - **Without PostgreSQL:** The API runs without a database: health reports database as "error", dashboard metrics and emails return zeros/empty. Start the API and dashboard as usual; the UI will load and show "Database or backend may be unavailable" if the backend is unreachable.
   - **Redis** is used for Celery and queue stats. If Redis is not running, health reports redis as "error" and queue stats return zeros; the API still responds.

4. **Database migrations (Alembic)**  
   From the `backend` folder, apply migrations to create or update the schema:
   ```bash
   alembic upgrade head
   ```
   If the database already has tables (e.g. created earlier with `create_all` or scripts), mark it as current without running the initial migration:
   ```bash
   alembic stamp head
   ```
   To create a new migration after changing `app/db/models.py`:
   ```bash
   alembic revision --autogenerate -m "description of change"
   alembic upgrade head
   ```

5. **Environment**
   ```bash
   cp .env.example .env
   # Edit .env: AZURE_*, MAILBOX_EMAIL, DB/Redis URLs. For Phase 2 AI classification add OPENAI_API_KEY (and optionally OPENAI_MODEL, default gpt-4o-mini).
   # If you already have the DB from Phase 1, run: python scripts/add_phase2_columns.py to add AI columns.
   ```

## Run

**API**  
From the `backend` folder:
```bat
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
(If you use a venv, activate it first, then run the same command. Or use `run.bat` after `setup.bat`.)

**Celery worker**
```bash
celery -A app.workers.celery_app worker --loglevel=info
```
On Windows the app uses the `solo` pool by default to avoid worker crashes; no extra flags needed.  
**If you add or change Celery tasks,** restart the worker so it picks up the new tasks (e.g. `backfill_classify_emails_task` for "Classify all").

**Optional (Phase 2+): start Graph subscription** — Requires `WEBHOOK_BASE_URL` in .env and a public URL. Call `POST /api/webhook/subscribe` with `{"user_id": "<mailbox-user-id>"}` to ingest new mail via webhooks.

## Why does the backend show no emails?

Updating `.env` (Azure tenant, client id, secret) is not enough. Emails get into the database in one of two ways:

1. **Backfill (recommended first)** — Sync **existing** mail from Microsoft Graph into PostgreSQL:
   - **PostgreSQL and Redis must be running.** Start a **Celery worker** (see Run above).
   - Call **`POST /api/emails/backfill`** with body: `{"user_id": "<mailbox-id>", "folder_id": "inbox", "days": 7}`.  
     `user_id` is the mailbox to sync: use the user’s **email address** (UPN) or their **Azure AD object ID**.
   - The job is enqueued; the Celery worker fetches messages from Graph and writes them to the DB. Refresh the dashboard after the worker finishes.

2. **Webhooks (Phase 2+)** — For **new** mail after subscription: set `WEBHOOK_BASE_URL` to a public URL and call `POST /api/webhook/subscribe`. Phase 1 uses backfill only.

So: **run backfill once** to see existing mail (Phase 1). Keep Celery running for the sync.

## Phase 2 — AI classification

- After each email is ingested, a **classify_email_task** runs (if `OPENAI_API_KEY` is set) and stores: **summary**, **category** (Sales, HR, Accounts, Tech, General, Spam), **priority** (score + label: Critical/High/Medium/Low/Spam), and **suggested replies** (1–3 options).
- **Existing DB:** run `python scripts/add_phase2_columns.py` once to add the new columns to the `emails` table.
- **Observability columns:** run `python scripts/add_phase2_observability_columns.py` once to add `processing_status`, `ai_status`, `ai_error_message`, `ai_confidence_score` and backfill existing rows.
- List and detail APIs return these fields; the dashboard shows them in the emails list and on the email detail page.

### Why summaries were not showing

Summaries can be missing in the UI for one or more of these reasons:

1. **API returned empty or invalid JSON** — The model sometimes wrapped JSON in markdown or returned extra text. The classifier now strips markdown, tries to find a `{ ... }` block, and accepts both `"summary"` and `"Summary"` keys. Debug logs (`AI_RESPONSE`, `PARSED_SUMMARY`, `DB_SAVE_STATUS`) help trace failures.
2. **No OPENAI_API_KEY or key invalid** — Classification was skipped or failed; the task now sets `ai_status = "failed"` and stores `ai_error_message`, and the UI shows a fallback and a "Retry" button.
3. **Parse/network errors** — The classifier now retries up to 3 times with exponential backoff and logs parse/API errors. On final failure the email is marked `ai_status = "failed"`.
4. **Frontend hid the block when summary was null** — The detail page only showed "AI insights" when at least one of summary/category/priority was present. It now always shows the AI section and displays *"Summary not available (AI pending or failed)."* when summary is missing.

After deploying the fixes, run "Classify all" again or use **POST /api/emails/:id/retry-ai** for a single email.

### DB schema changes (Phase 2 observability)

| Table  | Column               | Type           | Description                                      |
|--------|----------------------|----------------|--------------------------------------------------|
| emails | processing_status    | VARCHAR(32)    | received, ingested, classified, failed           |
| emails | ai_status            | VARCHAR(32)    | pending, completed, failed                        |
| emails | ai_error_message     | TEXT           | Last error if ai_status = failed                 |
| emails | ai_confidence_score  | FLOAT          | Optional 0–1 from AI                             |

Indexes: `processing_status`, `ai_status` (and existing `message_id`, `received_at`, `ai_category`, `ai_priority_label`, `conversation_id`).

**Migration:** `python scripts/add_phase2_observability_columns.py`

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health + DB/Redis status |
| GET | /api/emails | List emails (page, pageSize, search, from, to) |
| **POST** | **/api/emails/backfill** | Enqueue sync of existing mail from Graph (body: `user_id`, optional `folder_id`, `days`) |
| GET | /api/dashboard/metrics | KPIs for dashboard |
| GET | /api/webhook/status | Webhook subscription status |
| POST | /api/webhook/notify | Graph callback (validation + notifications) |
| POST | /api/webhook/subscribe | Create subscription (body: `user_id`) |
| GET | /api/queue/status | Queue/worker stats |
| GET | /api/settings | Read-only config (secrets masked) |
| GET | /api/system/health | Webhook status, last webhook ts, AI latency avg, queue backlog |
| POST | /api/emails/:id/retry-ai | Re-enqueue AI classification for one email |

## Project layout

```
app/
  main.py           # FastAPI app, CORS, routes
  config.py         # Settings from env
  api/              # health, webhook, emails, dashboard, queue, settings
  db/               # session, models (Email, Attachment, Sender)
  graph/            # auth (token), client (messages), webhook (subscribe/renew)
  workers/          # celery_app, tasks (ingest_email_task, classify_email_task, backfill_emails_task)
  ai/               # classifier (OpenAI: summary, category, priority, reply suggestions)
```

## Connect frontend

In the Next.js dashboard, set:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
and point the API client to it so it calls the real backend instead of mock routes.
