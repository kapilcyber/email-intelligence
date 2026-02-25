"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { MetricCard } from "@/components/cards/metric-card";
import { EmailsTable } from "@/components/tables/emails-table";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import type { DashboardMetrics, EmailRecord } from "@/lib/types";
import { Mail, ListTodo, Cpu, RefreshCw, Sparkles } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

function loadMetrics(
  api: ReturnType<typeof getApi>,
  setMetrics: (m: DashboardMetrics | null) => void,
  setMetricsError: (e: string | null) => void,
  setLoading: (b: boolean) => void
) {
  setLoading(true);
  api
    .getDashboardMetrics()
    .then(setMetrics)
    .catch(() => setMetricsError("Failed to load metrics"))
    .finally(() => setLoading(false));
}

function loadEmails(
  api: ReturnType<typeof getApi>,
  setEmails: (e: EmailRecord[]) => void,
  setEmailsError: (e: string | null) => void,
  setLoading: (b: boolean) => void
) {
  setLoading(true);
  api
    .getEmails({ page: 1, pageSize: 10 })
    .then((r) => setEmails(r.emails))
    .catch(() => setEmailsError("Failed to load emails"))
    .finally(() => setLoading(false));
}

const CATEGORY_ORDER = ["Sales", "HR", "Accounts", "Tech", "General", "Spam"];
const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low", "Spam"];
const BAR_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#6366f1", "#94a3b8"];

function DashboardAiChartsEmpty({
  api,
  onClassifyAll,
}: {
  api: ReturnType<typeof getApi>;
  onClassifyAll?: () => void;
}) {
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleClick = () => {
    if (!onClassifyAll) return;
    setClassifyLoading(true);
    setClassifyMessage(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    api
      .triggerClassifyBackfill()
      .then((r) => {
        const msg = r.message ?? "Classification started. This may take a few minutes. The page will refresh automatically.";
        setClassifyMessage(msg);
        onClassifyAll();
        pollRef.current = setInterval(() => {
          onClassifyAll();
        }, 8000);
        setTimeout(() => {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 120000);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to enqueue. Is the backend running?";
        setClassifyMessage(msg);
      })
      .finally(() => setClassifyLoading(false));
  };
  return (
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900/30">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        <Sparkles className="h-4 w-4" />
        AI classification overview
      </h2>
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        No classified emails yet. Existing emails were synced before AI was enabled — run <strong>Classify all</strong> once to add summary, category, and priority. New emails will be classified automatically.
      </p>
      {onClassifyAll && (
        <>
          <Button
            size="sm"
            onClick={handleClick}
            disabled={classifyLoading}
          >
            <Sparkles className={`mr-2 h-4 w-4 ${classifyLoading ? "animate-pulse" : ""}`} />
            {classifyLoading ? "Enqueuing…" : "Classify all"}
          </Button>
          {classifyMessage && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                classifyMessage.startsWith("Classification started")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : classifyMessage.startsWith("Failed")
                    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
              role="status"
            >
              {classifyMessage}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DashboardAiCharts({
  api,
  metrics,
  loading,
  onClassifyAll,
}: {
  api: ReturnType<typeof getApi>;
  metrics: DashboardMetrics | null;
  loading: boolean;
  onClassifyAll?: () => void;
}) {
  const categoryData = useMemo(() => {
    const counts = metrics?.categoryCounts ?? {};
    const ordered = CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0).map((name) => ({
      name,
      count: counts[name] ?? 0,
    }));
    const rest = Object.keys(counts)
      .filter((k) => !CATEGORY_ORDER.includes(k))
      .map((name) => ({ name, count: counts[name] ?? 0 }));
    return [...ordered, ...rest];
  }, [metrics?.categoryCounts]);

  const priorityData = useMemo(() => {
    const counts = metrics?.priorityCounts ?? {};
    const ordered = PRIORITY_ORDER.filter((p) => (counts[p] ?? 0) > 0).map((name) => ({
      name,
      count: counts[name] ?? 0,
    }));
    const rest = Object.keys(counts)
      .filter((k) => !PRIORITY_ORDER.includes(k))
      .map((name) => ({ name, count: counts[name] ?? 0 }));
    return [...ordered, ...rest];
  }, [metrics?.priorityCounts]);

  const hasAny = categoryData.length > 0 || priorityData.length > 0;

  if (loading) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900/30">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <Sparkles className="h-4 w-4" />
          AI classification overview
        </h2>
        <div className="h-64 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      </section>
    );
  }

  if (!hasAny) {
    return <DashboardAiChartsEmpty api={api} onClassifyAll={onClassifyAll} />;
  }

  return (
    <section className="space-y-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        <Sparkles className="h-4 w-4" />
        AI classification overview
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Emails by category
          </h3>
          {categoryData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" width={72} className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [value, "Emails"]}
                    contentStyle={{ borderRadius: "8px" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No category data yet
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Emails by priority
          </h3>
          {priorityData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" width={72} className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [value, "Emails"]}
                    contentStyle={{ borderRadius: "8px" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {priorityData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No priority data yet
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const api = useMemo(() => getApi(session?.user?.email ?? null), [session?.user?.email]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics);
    loadEmails(api, setEmails, setEmailsError, setLoadingEmails);
  }, [api]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics);
  }, [status, api]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadEmails(api, setEmails, setEmailsError, setLoadingEmails);
  }, [status, api]);

  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (syncStopRef.current) clearTimeout(syncStopRef.current);
    };
  }, []);

  const onSyncInbox = (syncAll = false, days?: number) => {
    setBackfillStatus(null);
    if (syncPollRef.current) {
      clearInterval(syncPollRef.current);
      syncPollRef.current = null;
    }
    if (syncStopRef.current) {
      clearTimeout(syncStopRef.current);
      syncStopRef.current = null;
    }
    const body = syncAll ? { all: true } : days !== undefined ? { days } : {};
    api
      .triggerBackfill(body)
      .then((r) => {
        const msg = r.message ?? "Sync started. Refreshing automatically.";
        const noWorkers = (metrics?.activeWorkers ?? 0) === 0;
        setBackfillStatus(
          noWorkers
            ? `${msg} If emails don’t appear, start a Celery worker: celery -A app.workers.celery_app worker --loglevel=info (from the backend folder).`
            : msg
        );
        refresh();
        setTimeout(() => refresh(), 1000);
        syncPollRef.current = setInterval(() => refresh(), 2500);
        syncStopRef.current = setTimeout(() => {
          if (syncPollRef.current) {
            clearInterval(syncPollRef.current);
            syncPollRef.current = null;
          }
          syncStopRef.current = null;
        }, 35000);
      })
      .catch((e) => setBackfillStatus(e instanceof Error ? e.message : "Sync failed."));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Email ingestion, queue, and AI classification stats
          </p>
          {(metricsError || emailsError) && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {[metricsError, emailsError].filter(Boolean).join(" • ")} — Database or backend may be unavailable.
            </p>
          )}
          {!metricsError && !emailsError && emails.length === 0 && (metrics?.emailsIngestedToday ?? 0) === 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-medium">Why no emails?</p>
              <p className="mt-1 text-xs">
                Emails are synced from Microsoft Graph, not shown by default. Do this in order:
              </p>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-xs">
                <li>Ensure <strong>PostgreSQL</strong> and <strong>Redis</strong> are running (health above should be healthy).</li>
                <li>Start the <strong>Celery worker</strong> in a separate terminal: <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-700">celery -A app.workers.celery_app worker --loglevel=info</code> (from the <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-700">backend</code> folder).</li>
                <li>Click <strong>Sync inbox</strong> above. The worker will fetch mail from your signed-in Outlook mailbox.</li>
                <li>Wait a few seconds, then refresh or click Sync again. If Azure app lacks <strong>Mail.Read</strong> or credentials are wrong, the worker log will show the error.</li>
              </ol>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => onSyncInbox(false, 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync for today
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSyncInbox(false)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync inbox (7 days)
          </Button>
          <Button variant="default" size="sm" onClick={() => onSyncInbox(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync all emails
          </Button>
        </div>
      </div>
      {backfillStatus && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{backfillStatus}</p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Emails Ingested Today"
          value={loadingMetrics ? "—" : metrics?.emailsIngestedToday ?? 0}
          subtitle="Received today (UTC). Use Sync for today to pull new mail."
          badge={loadingMetrics ? null : <Mail className="h-4 w-4 text-neutral-400" />}
        />
        <MetricCard
          title="Queue Size"
          value={loadingMetrics ? "—" : metrics?.queueSize ?? 0}
          subtitle="Tasks pending"
          badge={loadingMetrics ? null : <ListTodo className="h-4 w-4 text-neutral-400" />}
        />
        <MetricCard
          title="Worker Status"
          value={loadingMetrics ? "—" : `${metrics?.activeWorkers ?? 0} active`}
          badge={loadingMetrics ? null : <Cpu className="h-4 w-4 text-neutral-400" />}
        />
        <MetricCard
          title="Classified / Unclassified"
          value={
            loadingMetrics
              ? "—"
              : `${metrics?.totalClassified ?? 0} / ${(metrics?.totalEmails ?? 0) - (metrics?.totalClassified ?? 0)}`
          }
          subtitle={`${metrics?.totalClassified ?? 0} of ${metrics?.totalEmails ?? 0} total`}
          badge={loadingMetrics ? null : <Sparkles className="h-4 w-4 text-neutral-400" />}
        />
        <MetricCard
          title="AI Failures"
          value={loadingMetrics ? "—" : metrics?.aiFailureCount ?? 0}
          subtitle="Classification failed"
          badge={loadingMetrics ? null : <Sparkles className="h-4 w-4 text-neutral-400" />}
        />
      </section>

      <DashboardAiCharts
        api={api}
        metrics={metrics}
        loading={loadingMetrics}
        onClassifyAll={refresh}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Recent emails
        </h2>
        {emailsError && (
          <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{emailsError}</p>
        )}
        <EmailsTable
          emails={emails}
          isLoading={loadingEmails}
          emptyMessage={emailsError ? "Could not load emails." : "No recent emails."}
          getEmailLink={(e) => `/emails/${e.id}`}
        />
      </section>
    </div>
  );
}
