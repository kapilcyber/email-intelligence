# Email Intelligence — Phase 1 Dashboard

Internal operations dashboard for email ingestion and infrastructure monitoring.

## Tech stack

- **Next.js** (App Router), **TypeScript**, **TailwindCSS**
- **ShadCN-style** UI (Button, Card, Badge, Input, Skeleton, Dropdown, Select)
- **Lucide** icons, **Recharts** (Queue Monitor)
- **next-themes** for dark mode

## Run locally

**With backend (default):** `.env.local` points the dashboard at `http://localhost:8000`. Run both:

```bash
# Terminal 1 — backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Terminal 2 — dashboard
cd email-dashboard && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard uses the Phase 1 backend API.

**Without backend:** Remove or rename `.env.local`, or set `NEXT_PUBLIC_API_URL=` in `.env.local`. Then `npm run dev` uses the built-in API routes (they return empty data until a backend is configured).

## Routes

| Route | Description |
|-------|-------------|
| `/dashboard` | KPIs (emails today, webhook, queue, workers) + recent emails table |
| `/emails` | Full emails table with pagination, search, date filters |
| `/webhook` | Graph webhook subscription status + error logs |
| `/queue` | Redis/Celery queue stats + task distribution chart |
| `/settings` | Read-only config (secrets masked) |

## API

Typed client: `lib/api/client.ts`. When `NEXT_PUBLIC_API_URL` is set (e.g. in `.env.local`), all calls go to the Phase 1 backend:

- `GET /api/health`
- `GET /api/dashboard/metrics`
- `GET /api/emails?page=&pageSize=&search=&from=&to=`
- `GET /api/webhook/status`
- `GET /api/queue/status`
- `GET /api/settings`

With no `NEXT_PUBLIC_API_URL`, the app uses Next.js API routes under `app/api/` (empty responses).

## Structure

```
app/
  (dashboard)/          # Layout with sidebar + topbar
    dashboard/page.tsx
    emails/page.tsx
    webhook/page.tsx
    queue/page.tsx
    settings/page.tsx
  api/                  # Mock API routes
components/
  layout/               # Sidebar, Topbar
  cards/                # MetricCard
  tables/               # EmailsTable
  status/               # StatusBadge
  ui/                   # Button, Card, Badge, Input, Skeleton, Dropdown, Select
lib/
  api/                  # client.ts
  types/                # Shared TypeScript interfaces
```
