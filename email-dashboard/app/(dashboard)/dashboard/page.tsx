"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { DashboardMetrics, EmailRecord } from "@/lib/types";
import Link from "next/link";
import { RefreshCw, Sparkles, FileText, FileEdit, FileStack, ClipboardList, MoreHorizontal, Plus } from "lucide-react";
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

  const [classifyLoading, setClassifyLoading] = useState(false);
  const onClassifyAll = () => {
    setClassifyLoading(true);
    api
      .triggerClassifyBackfill()
      .then(() => refresh())
      .finally(() => setClassifyLoading(false));
  };

  const actionCards = [
    { label: "Sync for today", icon: FileText, onClick: () => onSyncInbox(false, 1) },
    { label: "Sync inbox (7 days)", icon: FileEdit, onClick: () => onSyncInbox(false) },
    { label: "Sync all emails", icon: FileStack, onClick: () => onSyncInbox(true) },
    { label: "Classify all", icon: ClipboardList, onClick: onClassifyAll },
  ];

  const kpiCards = [
    { title: "Emails Today", value: loadingMetrics ? "—" : (metrics?.emailsIngestedToday ?? 0), subtitle: "Received today" },
    { title: "Queue Size", value: loadingMetrics ? "—" : (metrics?.queueSize ?? 0), subtitle: "Tasks pending" },
    { title: "Workers", value: loadingMetrics ? "—" : `${metrics?.activeWorkers ?? 0} active`, subtitle: "Active workers" },
    { title: "Classified", value: loadingMetrics ? "—" : `${metrics?.totalClassified ?? 0} / ${metrics?.totalEmails ?? 0}`, subtitle: "Total emails" },
  ];

  const teamPlaceholders = [
    { name: "Jerome Bell", role: "Creative Director" },
    { name: "Brooklyn Simmons", role: "UI Designer" },
    { name: "Cameroon Williamson", role: "Project Manager" },
  ];

  return (
    <div className="space-y-6">
      {(metricsError || emailsError) && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {[metricsError, emailsError].filter(Boolean).join(" • ")} — Database or backend may be unavailable.
        </p>
      )}
      {backfillStatus && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{backfillStatus}</p>
      )}
      {!metricsError && !emailsError && emails.length === 0 && (metrics?.emailsIngestedToday ?? 0) === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Why no emails?</p>
          <p className="mt-1 text-xs">Ensure PostgreSQL, Redis, and Celery worker are running, then use <strong>Sync for today</strong> or <strong>Sync inbox</strong> below.</p>
        </div>
      )}

      {/* Action cards row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actionCards.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={(label === "Classify all" && classifyLoading) || (label.startsWith("Sync") && loadingMetrics)}
            className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition hover:border-neutral-300 hover:shadow dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:border-neutral-600"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Icon className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
          </button>
        ))}
      </section>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map(({ title, value, subtitle }) => (
          <div
            key={title}
            className="relative rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50"
          >
            <button type="button" className="absolute right-2 top-2 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          </div>
        ))}
      </section>

      {/* Time-Based Activity Map + right column */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Time-Based Activity Map</h2>
              <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-600">
                <button type="button" className="rounded-l-md bg-[#1E1E1E] px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-700">Daily</button>
                <button type="button" className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700">Weekly</button>
                <button type="button" className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700">Monthly</button>
                <button type="button" className="rounded-r-md px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700">Yearly</button>
              </div>
            </div>
            <DashboardAiCharts api={api} metrics={metrics} loading={loadingMetrics} onClassifyAll={refresh} />
          </section>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Team</h2>
              <button type="button" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-3">
              {teamPlaceholders.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    {p.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{p.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Upcoming Meeting</h2>
              <button type="button" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">Dev Sync Meeting</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Monday, Feb 8 — 10:00 AM</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>61 comments</span>
                <span>1 attachment</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today Projects — recent emails as cards */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Today Projects</h2>
          <Link href="/emails">
            <Button size="sm" className="gap-1.5 rounded-lg">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>
        {emailsError && (
          <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{emailsError}</p>
        )}
        {loadingEmails ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800" />
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50/50 py-12 dark:border-neutral-700 dark:bg-neutral-900/30">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{emailsError ? "Could not load emails." : "No recent emails."}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {emails.slice(0, 6).map((e) => (
              <Link key={e.id} href={`/emails/${e.id}`} className="group block rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-neutral-300 hover:shadow dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:border-neutral-600">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-1">{e.subject || "No subject"}</span>
                  <button type="button" className="shrink-0 rounded p-1 text-neutral-400 opacity-0 group-hover:opacity-100 hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="More" onClick={(ev) => ev.preventDefault()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <span
                  className={cn(
                    "mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium",
                    (e.ai_priority_label === "Critical" || e.ai_priority_label === "High") ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  )}
                >
                  {e.ai_priority_label || "Medium"}
                </span>
                <p className="mt-2 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">{e.body_preview || "No preview"}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
