"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type {
  DashboardMetrics,
  EmailRecord,
  UserOut,
  TeamOut,
  UserEscalationCountOut,
  UserLeadCountOut,
  CalendarEventOut,
} from "@/lib/types";
import Link from "next/link";
import {
  RefreshCw,
  Sparkles,
  FileText,
  FileEdit,
  FileStack,
  ClipboardList,
  MoreHorizontal,
  Calendar,
  ExternalLink,
  Video,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
  Legend,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  Legend as RechartsLegend,
} from "recharts";

type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly";

function loadMetrics(
  api: ReturnType<typeof getApi>,
  setMetrics: (m: DashboardMetrics | null) => void,
  setMetricsError: (e: string | null) => void,
  setLoading: (b: boolean) => void,
  period?: ChartPeriod
) {
  setLoading(true);
  api
    .getDashboardMetrics(period)
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

function parseGraphDateTime(iso: string | undefined | null): Date | null {
  if (!iso?.trim()) return null;
  let s = iso.trim();
  if (!s.endsWith("Z") && !s.includes("+") && !/T\d{2}:\d{2}.*-\d{2}:?\d{2}$/.test(s)) {
    s = `${s}Z`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatCalendarEventWhen(ev: CalendarEventOut): string {
  const d = parseGraphDateTime(ev.start?.dateTime);
  if (!d) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function onlineMeetingLinkLabel(url: string | null | undefined): string {
  if (!url) return "Join";
  const u = url.toLowerCase();
  if (u.includes("teams.microsoft") || u.includes("teams.live")) return "Join Teams";
  if (u.includes("zoom.")) return "Join Zoom";
  if (u.includes("meet.google")) return "Join Google Meet";
  return "Join meeting";
}

/** Upcoming / ongoing / recent cancellations for the dashboard list */
function selectDashboardCalendarEvents(events: CalendarEventOut[], now: Date): CalendarEventOut[] {
  const sorted = [...events].sort((a, b) => {
    const ta = parseGraphDateTime(a.start?.dateTime)?.getTime() ?? 0;
    const tb = parseGraphDateTime(b.start?.dateTime)?.getTime() ?? 0;
    return ta - tb;
  });
  return sorted.filter((ev) => {
    if (ev.isCancelled) return true;
    const end = parseGraphDateTime(ev.end?.dateTime);
    if (end) return end.getTime() >= now.getTime() - 60_000;
    const start = parseGraphDateTime(ev.start?.dateTime);
    if (start) return start.getTime() >= now.getTime() - 86_400_000;
    return true;
  });
}

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
  isAdmin = false,
}: {
  api: ReturnType<typeof getApi>;
  metrics: DashboardMetrics | null;
  loading: boolean;
  onClassifyAll?: () => void;
  isAdmin?: boolean;
}) {
  const [escalationByUser, setEscalationByUser] = useState<UserEscalationCountOut[] | null>(null);
  const [leadCountsByUser, setLeadCountsByUser] = useState<UserLeadCountOut[] | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setEscalationByUser(null);
      setLeadCountsByUser(null);
      return;
    }
    api
      .getEscalationCountsByUser()
      .then((rows) => setEscalationByUser(rows ?? []))
      .catch(() => setEscalationByUser([]));
    api
      .getLeadCountsByUser()
      .then((rows) => setLeadCountsByUser(rows ?? []))
      .catch(() => setLeadCountsByUser([]));
  }, [isAdmin, api]);

  const memberEscalationChartData = useMemo(() => {
    if (!escalationByUser?.length) return [];
    return [...escalationByUser]
      .filter((u) => (u.escalationCount ?? 0) > 0)
      .sort((a, b) => (b.escalationCount ?? 0) - (a.escalationCount ?? 0))
      .map((u) => {
        const label = (u.displayName ?? u.email.split("@")[0] ?? u.email ?? "?").trim();
        return {
          name: label,
          count: u.escalationCount ?? 0,
          email: u.email,
        };
      });
  }, [escalationByUser]);

  const memberLeadChartData = useMemo(() => {
    if (!leadCountsByUser?.length) return [];
    const filtered = [...leadCountsByUser]
      .filter((u) => (u.leadCount ?? 0) > 0)
      .sort((a, b) => (b.leadCount ?? 0) - (a.leadCount ?? 0));
    const max = Math.max(...filtered.map((u) => u.leadCount ?? 0), 1);
    return filtered.map((u, i) => {
      const label = (u.displayName ?? u.email.split("@")[0] ?? u.email ?? "?").trim();
      const count = u.leadCount ?? 0;
      return {
        name: label,
        count,
        value: Math.round((count / max) * 100),
        fill: BAR_COLORS[i % BAR_COLORS.length],
        email: u.email,
      };
    });
  }, [leadCountsByUser]);

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

  const categoryKpiData = useMemo(() => {
    const counts = metrics?.categoryCounts ?? {};
    const rows = CATEGORY_ORDER.map((name) => ({
      category: name,
      count: counts[name] ?? 0,
    }));
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / total) * 100) }));
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

  const streamPriorityData = useMemo(() => {
    const counts = metrics?.priorityCounts ?? {};
    const point: Record<string, number> = { x: 1 };
    let hasAny = false;
    for (const p of PRIORITY_ORDER) {
      point[p] = counts[p] ?? 0;
      if (point[p] > 0) hasAny = true;
    }
    for (const k of Object.keys(counts ?? {})) {
      if (!PRIORITY_ORDER.includes(k)) {
        point[k] = counts[k] ?? 0;
        if (point[k] > 0) hasAny = true;
      }
    }
    if (!hasAny) return [];
    const zero: Record<string, number> = { x: 0 };
    const end: Record<string, number> = { x: 2 };
    for (const key of Object.keys(point)) {
      if (key === "x") continue;
      zero[key] = 0;
      end[key] = 0;
    }
    return [zero, point, end];
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
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
              By category
            </span>
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Emails by category (KPI)
            </h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={categoryKpiData} margin={{ top: 8, right: 32, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} className="dark:stroke-neutral-700" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 10 }}
                  className="text-neutral-600 dark:text-neutral-400"
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tick={{ fontSize: 10 }}
                  className="text-neutral-500 dark:text-neutral-500"
                  label={{ value: "Email count", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  className="text-neutral-500 dark:text-neutral-500"
                  label={{ value: "% of total", angle: 90, position: "insideRight", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "8px" }}
                  formatter={(value: number, name: string) => [name === "pct" ? `${value}%` : value, name === "pct" ? "% of total" : "Email count"]}
                  labelFormatter={(label) => `Category: ${label}`}
                />
                <Legend layout="horizontal" align="right" verticalAlign="top" wrapperStyle={{ paddingBottom: 8 }} />
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  name="Email count"
                  fill="#22d3ee"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pct"
                  name="% of total"
                  stroke="#1e3a8a"
                  strokeWidth={2}
                  dot={{ fill: "#1e3a8a", r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-left text-[10px] text-neutral-500 dark:text-neutral-400">
            Showing {categoryKpiData.length} categor{categoryKpiData.length === 1 ? "y" : "ies"}.
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Emails by priority
          </h3>
          {streamPriorityData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={streamPriorityData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <defs>
                    {PRIORITY_ORDER.map((_, i) => (
                      <linearGradient key={i} id={`priority-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BAR_COLORS[i % BAR_COLORS.length]} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={BAR_COLORS[i % BAR_COLORS.length]} stopOpacity={0.2} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-neutral-200 dark:stroke-neutral-700" />
                  <XAxis dataKey="x" hide />
                  <YAxis type="number" tick={{ fontSize: 10 }} className="text-xs" />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px" }}
                    formatter={(value: number, name: string) => [value, name]}
                    labelFormatter={() => "Emails"}
                  />
                  <Legend />
                  {PRIORITY_ORDER.map((name, i) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stackId="1"
                      stroke={BAR_COLORS[i % BAR_COLORS.length]}
                      fill={`url(#priority-fill-${i})`}
                      strokeWidth={1}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No priority data yet
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Escalations by team member
              </h3>
              <Link
                href="/admin/escalations"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Open Escalations →
              </Link>
            </div>
            {escalationByUser === null ? (
              <div className="h-80 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
            ) : memberEscalationChartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No escalation emails per mailbox yet.
              </p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberEscalationChartData} margin={{ top: 8, right: 8, left: 8, bottom: 56 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-neutral-200 dark:stroke-neutral-700" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-40}
                      textAnchor="end"
                      height={56}
                      interval={0}
                      className="text-neutral-600 dark:text-neutral-400"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                      className="text-neutral-500"
                      label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px" }}
                      formatter={(value: number, _n: string, item: { payload?: { email?: string } }) => [
                        `${value}`,
                        item.payload?.email ? `${item.payload.email}` : "Escalations",
                      ]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Escalations">
                      {memberEscalationChartData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
        {isAdmin && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Leads by team member (Nightingale)
              </h3>
              <Link
                href="/admin/leads"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Open Leads →
              </Link>
            </div>
            {leadCountsByUser === null ? (
              <div className="h-80 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
            ) : memberLeadChartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No lead emails per mailbox yet.
              </p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="20%"
                    outerRadius="90%"
                    data={memberLeadChartData}
                    startAngle={180}
                    endAngle={-180}
                  >
                    <RadialBar
                      background
                      dataKey="value"
                      nameKey="name"
                      minAngle={5}
                      cornerRadius={4}
                      label={{ position: "insideStart", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px" }}
                      formatter={(_value: number, _n: string, item: { payload?: { count?: number; email?: string } }) => [
                        `${item.payload?.count ?? 0}`,
                        item.payload?.email ? `${item.payload.email}` : "Leads",
                      ]}
                    />
                    <RechartsLegend />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [me, setMe] = useState<{
    reportingManager?: { displayName: string | null; email: string } | null;
    department?: string | null;
    isAdmin?: boolean;
  } | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserOut[] | null>(null);
  const [teams, setTeams] = useState<TeamOut[] | null>(null);
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("weekly");
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventOut[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCalendar = useCallback(() => {
    if (status !== "authenticated") return;
    setCalendarLoading(true);
    // Meeting invites from synced Mail (Graph Mail), not Graph calendar — works for all users with mail sync.
    api
      .getDashboardCalendarEvents(14, null, "mail")
      .then((r) => {
        setCalendarEvents(r.events ?? []);
        setCalendarError(r.error ?? null);
      })
      .catch(() => {
        setCalendarEvents([]);
        setCalendarError("Could not load calendar.");
      })
      .finally(() => setCalendarLoading(false));
  }, [api, status]);

  const displayedCalendarEvents = useMemo(
    () => selectDashboardCalendarEvents(calendarEvents, new Date()).slice(0, 8),
    [calendarEvents]
  );

  const refresh = useCallback(() => {
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics, chartPeriod);
    loadEmails(api, setEmails, setEmailsError, setLoadingEmails);
  }, [api, chartPeriod]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics, chartPeriod);
  }, [status, api, chartPeriod]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadEmails(api, setEmails, setEmailsError, setLoadingEmails);
  }, [status, api]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadCalendar();
  }, [status, loadCalendar]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const id = window.setInterval(loadCalendar, 120_000);
    return () => window.clearInterval(id);
  }, [status, loadCalendar]);

  const refreshMe = useCallback(() => {
    api
      .getMe()
      .then((r) =>
        setMe({
          reportingManager: r.reportingManager ?? null,
          department: r.department ?? null,
          isAdmin: r.isAdmin ?? false,
        })
      )
      .catch(() => setMe(null));
  }, [api]);

  useEffect(() => {
    if (status !== "authenticated") return;
    refreshMe();
  }, [status, refreshMe]);

  // Poll me (team/department/reporting manager) so admin changes show in real time on user dashboard
  useEffect(() => {
    if (status !== "authenticated") return;
    mePollRef.current = setInterval(refreshMe, 10000);
    return () => {
      if (mePollRef.current) {
        clearInterval(mePollRef.current);
        mePollRef.current = null;
      }
    };
  }, [status, refreshMe]);

  // Refetch me when tab becomes visible (e.g. user returns after admin changed their team)
  useEffect(() => {
    if (status !== "authenticated") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshMe();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [status, refreshMe]);

  const refreshTeamMembers = useCallback(() => {
    if (!me?.isAdmin) return;
    Promise.all([
      api.getUsers().then((u) => setTeamMembers(u ?? [])).catch(() => setTeamMembers([])),
      api.getTeams().then((t) => setTeams(t ?? [])).catch(() => setTeams([])),
    ]);
  }, [api, me?.isAdmin]);

  useEffect(() => {
    if (status !== "authenticated" || !me?.isAdmin) return;
    refreshTeamMembers();
  }, [status, me?.isAdmin, refreshTeamMembers]);

  // Poll team list for admin so changes (e.g. team assignment) show in real time
  useEffect(() => {
    if (status !== "authenticated" || !me?.isAdmin) return;
    const teamPoll = setInterval(refreshTeamMembers, 10000);
    return () => clearInterval(teamPoll);
  }, [status, me?.isAdmin, refreshTeamMembers]);

  // Department → teams → members (department = team name; one team per department for display)
  const departmentOrder = useMemo(() => ["Sales", "HR", "Accounts", "Tech", "General", "Spam"], []);
  const byDepartment = useMemo(() => {
    const users = teamMembers ?? [];
    const teamList = teams ?? [];
    const byTeamId = new Map<string, UserOut[]>();
    const unassigned: UserOut[] = [];
    for (const u of users) {
      if (u.teamId) {
        const list = byTeamId.get(u.teamId) ?? [];
        list.push(u);
        byTeamId.set(u.teamId, list);
      } else {
        unassigned.push(u);
      }
    }
    const seen = new Set<string>();
    const ordered: { department: string; teamId: string | null; teamName: string; users: UserOut[] }[] = [];
    for (const dept of departmentOrder) {
      const team = teamList.find((t) => t.name === dept);
      if (team) {
        seen.add(team.id);
        ordered.push({
          department: dept,
          teamId: team.id,
          teamName: team.name,
          users: byTeamId.get(team.id) ?? [],
        });
      }
    }
    for (const team of teamList) {
      if (seen.has(team.id)) continue;
      ordered.push({
        department: team.name,
        teamId: team.id,
        teamName: team.name,
        users: byTeamId.get(team.id) ?? [],
      });
    }
    if (unassigned.length > 0) {
      ordered.push({ department: "Unassigned", teamId: null, teamName: "—", users: unassigned });
    }
    return ordered;
  }, [teamMembers, teams, departmentOrder]);

  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (syncStopRef.current) clearTimeout(syncStopRef.current);
      if (mePollRef.current) clearInterval(mePollRef.current);
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

  const [syncFromDate, setSyncFromDate] = useState("");
  const [syncToDate, setSyncToDate] = useState("");
  const [syncRangeLoading, setSyncRangeLoading] = useState(false);

  const onSyncByDateRange = () => {
    const from = (syncFromDate || "").trim();
    const to = (syncToDate || "").trim();
    if (!from && !to) {
      setBackfillStatus("Please choose at least a From date or To date.");
      return;
    }
    setSyncRangeLoading(true);
    setBackfillStatus(null);
    if (syncPollRef.current) {
      clearInterval(syncPollRef.current);
      syncPollRef.current = null;
    }
    if (syncStopRef.current) {
      clearTimeout(syncStopRef.current);
      syncStopRef.current = null;
    }
    api
      .triggerBackfill({ from_date: from || undefined, to_date: to || undefined })
      .then((r) => {
        const msg = r.message ?? "Sync started. Refreshing automatically.";
        const noWorkers = (metrics?.activeWorkers ?? 0) === 0;
        setBackfillStatus(
          noWorkers
            ? `${msg} If emails don't appear, start a Celery worker.`
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
      .catch((e) => setBackfillStatus(e instanceof Error ? e.message : "Sync failed."))
      .finally(() => setSyncRangeLoading(false));
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
          <p className="mt-1 text-xs">Ensure PostgreSQL, Redis, and Celery worker are running, then use <strong>Sync 1 day</strong> or <strong>Sync 7 days</strong> below.</p>
        </div>
      )}

      {/* Sync actions: full-width row of cards that grow to fill space */}
      <section className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 flex-col gap-3 md:-mx-6 md:w-[calc(100%+3rem)]">
        <div className="flex w-full min-w-0 flex-wrap items-stretch gap-3 sm:gap-4 xl:flex-nowrap xl:gap-4">
          {actionCards.map(({ label, icon: Icon, onClick }) => {
            const title =
              label === "Sync for today"
                ? "Sync 1 day"
                : label === "Sync inbox (7 days)"
                  ? "Sync 7 days"
                  : label === "Sync all emails"
                    ? "Sync all mail"
                    : "Classify all mail";
            const disabled =
              (label === "Classify all" && classifyLoading) || (label.startsWith("Sync") && loadingMetrics);
            return (
              <button
                key={label}
                type="button"
                onClick={onClick}
                disabled={disabled}
                className="flex min-h-[118px] min-w-[140px] flex-1 basis-0 flex-col items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-5 text-center shadow-sm transition hover:border-neutral-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:border-neutral-600"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium leading-snug text-neutral-800 dark:text-neutral-200">{title}</span>
              </button>
            );
          })}

          <div className="flex min-h-[118px] min-w-[min(100%,260px)] flex-[1.35] basis-0 flex-col justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                <Calendar className="h-6 w-6" />
              </div>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Sync calendar</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
              <input
                type="date"
                value={syncFromDate}
                onChange={(e) => setSyncFromDate(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Sync from date"
              />
              <input
                type="date"
                value={syncToDate}
                onChange={(e) => setSyncToDate(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                aria-label="Sync to date"
              />
            </div>
            <Button
              type="button"
              onClick={onSyncByDateRange}
              disabled={syncRangeLoading || loadingMetrics}
              variant="secondary"
              className="h-10 w-full text-sm"
            >
              {syncRangeLoading ? "Syncing…" : "Run range sync"}
            </Button>
          </div>
        </div>
        <p className="px-4 text-[11px] text-neutral-500 dark:text-neutral-400 md:px-6">
          Calendar sync uses Inbox + Sent. Leave one date empty for an open-ended range.
        </p>
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
                {(["daily", "weekly", "monthly", "yearly"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setChartPeriod(p)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium",
                      p === "daily" && "rounded-l-md",
                      p === "yearly" && "rounded-r-md",
                      chartPeriod === p
                        ? "bg-[#1E1E1E] text-white dark:bg-neutral-700"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                    )}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <DashboardAiCharts
              api={api}
              metrics={metrics}
              loading={loadingMetrics}
              onClassifyAll={refresh}
              isAdmin={!!me?.isAdmin}
            />
          </section>
        </div>
        <div className="space-y-4">
          {me?.isAdmin ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Departments & Teams</h2>
                <button type="button" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
              {teamMembers === null && teams === null ? (
                <ul className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-600" />
                      <div className="min-w-0 flex-1">
                        <div className="h-4 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-600" />
                        <div className="mt-1 h-3 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-700" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : byDepartment.length === 0 ? (
                <p className="py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">No departments or team members loaded</p>
              ) : (
                <ul className="space-y-1">
                  {byDepartment.map(({ department, teamName, users }) => {
                    const isExpanded = expandedDepartment === department;
                    return (
                      <li key={department}>
                        <button
                          type="button"
                          onClick={() => setExpandedDepartment(isExpanded ? null : department)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-700/50"
                        >
                          <span>{department}</span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {users.length} member{users.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="ml-2 mt-1 rounded-lg border border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-800/30">
                            <p className="border-b border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                              Team: {teamName}
                            </p>
                            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
                              {users.length === 0 ? (
                                <li className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">No members</li>
                              ) : (
                                users.map((u) => {
                                  const name = u.displayName ?? u.email.split("@")[0] ?? u.email;
                                  const initials = name.split(/[\s@]/).filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?";
                                  return (
                                    <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                                      <div className="h-8 w-8 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center text-xs font-medium text-neutral-600 dark:text-neutral-300">
                                        {initials}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{name}</p>
                                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{u.role}</p>
                                      </div>
                                    </li>
                                  );
                                })
                              )}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Reporting manager</h2>
                <button type="button" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">You report to</p>
                  <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">
                    {me?.reportingManager
                      ? `${me.reportingManager.displayName ?? me.reportingManager.email} (${me.reportingManager.email})`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Department</p>
                  <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{me?.department ?? "—"}</p>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Meetings</h2>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">From meeting invites in your synced mail (not resume/CV)</p>
              </div>
              <button
                type="button"
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                aria-label="Refresh calendar"
                onClick={loadCalendar}
              >
                <RefreshCw className={`h-4 w-4 ${calendarLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            {calendarError && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {calendarError}
              </p>
            )}
            {calendarLoading && calendarEvents.length === 0 && !calendarError && (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
                <div className="h-10 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
              </div>
            )}
            {!calendarLoading && !calendarError && displayedCalendarEvents.length === 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                No meeting invites found in synced mail for this window. Sync mail from History and ensure meeting messages are ingested.
              </p>
            )}
            {displayedCalendarEvents.length > 0 && (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {displayedCalendarEvents.map((ev) => (
                    <li
                      key={ev.id ?? `${ev.subject}-${ev.start?.dateTime}`}
                      className={`rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50 ${
                        ev.isCancelled ? "opacity-75" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p
                          className={`text-sm font-medium text-neutral-900 dark:text-neutral-100 ${
                            ev.isCancelled ? "line-through" : ""
                          }`}
                        >
                          {ev.subject}
                        </p>
                        {ev.isCancelled && (
                          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/50 dark:text-red-200">
                            Cancelled
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {formatCalendarEventWhen(ev)}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </p>
                      {(ev.organizerName || ev.organizerEmail) && (
                        <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500">
                          {ev.organizerName ?? ev.organizerEmail}
                          {ev.organizerName && ev.organizerEmail ? ` · ${ev.organizerEmail}` : ""}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ev.joinUrl && !ev.isCancelled && (
                          <a
                            href={ev.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                          >
                            <Video className="h-3 w-3" />
                            {onlineMeetingLinkLabel(ev.joinUrl)}
                          </a>
                        )}
                        {ev.webLink && (
                          <a
                            href={ev.webLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open in Outlook
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
