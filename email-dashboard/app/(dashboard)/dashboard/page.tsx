"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { formatMomTimeRange } from "@/lib/mom-eligibility";
import type {
  DashboardMetrics,
  EmailRecord,
  UserOut,
  TeamOut,
  UserEscalationCountOut,
  UserLeadCountOut,
  CalendarEventOut,
  MyProjectItem,
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
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly";
type DashboardTourStep = {
  title: string;
  description: string;
  target: { current: HTMLDivElement | null };
};

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

function formatMeetingTimeRange(ev: CalendarEventOut): string {
  const start = parseGraphDateTime(ev.start?.dateTime);
  const end = parseGraphDateTime(ev.end?.dateTime);
  if (!start && !end) return "—";
  if (start && !end) return start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (!start && end) return end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${start!.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} - ${end!.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${classifyMessage.startsWith("Classification started")
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
    setEscalationByUser(null);
    setLeadCountsByUser(null);
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

  const prioritySeriesData = useMemo(() => {
    const byName = new Map(priorityData.map((p) => [p.name, p.count]));
    const ordered = PRIORITY_ORDER.map((name) => ({
      name,
      count: byName.get(name) ?? 0,
    }));
    const rest = priorityData.filter((p) => !PRIORITY_ORDER.includes(p.name));
    return [...ordered, ...rest];
  }, [priorityData]);

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
        <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-4 shadow-md shadow-sky-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-neutral-600 ring-1 ring-sky-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700">
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
                  isAnimationActive
                  animationDuration={900}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pct"
                  name="% of total"
                  stroke="#1e3a8a"
                  strokeWidth={2}
                  dot={{ fill: "#1e3a8a", r: 3 }}
                  isAnimationActive
                  animationDuration={1100}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-left text-[10px] text-neutral-500 dark:text-neutral-400">
            Showing {categoryKpiData.length} categor{categoryKpiData.length === 1 ? "y" : "ies"}.
          </p>
        </div>
        <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50 p-4 shadow-md shadow-violet-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Emails by priority
          </h3>
          {priorityData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={prioritySeriesData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <defs>
                    <linearGradient id="priority-area-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-neutral-200 dark:stroke-neutral-700" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px" }}
                    formatter={(value: number, _name: string, props: { payload?: { name?: string } }) => [
                      value,
                      props.payload?.name ?? "Priority",
                    ]}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Priority count"
                    stroke="#7c3aed"
                    strokeWidth={3}
                    fill="url(#priority-area-fill)"
                    isAnimationActive
                    animationDuration={900}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Priority trend"
                    stroke="#4c1d95"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#4c1d95" }}
                    isAnimationActive
                    animationDuration={1100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No priority data yet
            </p>
          )}
        </div>
        <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50 to-amber-50 p-4 shadow-md shadow-orange-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Escalations by team member
              </h3>
              <Link
                href={isAdmin ? "/admin/escalations" : "/escalations"}
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
                  <LineChart data={memberEscalationChartData} margin={{ top: 8, right: 8, left: 8, bottom: 56 }}>
                    <defs>
                      <linearGradient id="esc-line-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Escalations area"
                      stroke="none"
                      fill="url(#esc-line-fill)"
                      isAnimationActive
                      animationDuration={900}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Escalations"
                      stroke="#ea580c"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#ea580c" }}
                      activeDot={{ r: 6 }}
                      isAnimationActive
                      animationDuration={1100}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-cyan-50 p-4 shadow-md shadow-indigo-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Leads by team member (Nightingale)
              </h3>
              <Link
                href={isAdmin ? "/admin/leads" : "/leads"}
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
                  <RadarChart data={memberLeadChartData} outerRadius="72%">
                    <PolarGrid stroke="#dbeafe" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px" }}
                      formatter={(_value: number, _n: string, item: { payload?: { count?: number; email?: string } }) => [
                        `${item.payload?.count ?? 0}`,
                        item.payload?.email ? `${item.payload.email}` : "Leads",
                      ]}
                    />
                    <Radar
                      name="Leads"
                      dataKey="count"
                      stroke="#4f46e5"
                      fill="#6366f1"
                      fillOpacity={0.45}
                      isAnimationActive
                      animationDuration={1100}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
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
  const [myProjects, setMyProjects] = useState<MyProjectItem[]>([]);
  const [calendarMonthStart, setCalendarMonthStart] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedMeetingDateKey, setSelectedMeetingDateKey] = useState(() => toDateKey(new Date()));
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncActionsRef = useRef<HTMLDivElement>(null);
  const kpiCardsRef = useRef<HTMLDivElement>(null);
  const activityMapRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const departmentsCardRef = useRef<HTMLDivElement>(null);
  const meetingsCardRef = useRef<HTMLDivElement>(null);
  const [dashboardTourOpen, setDashboardTourOpen] = useState(false);
  const [dashboardTourStep, setDashboardTourStep] = useState(0);

  const loadCalendar = useCallback(() => {
    if (status !== "authenticated") return;
    setCalendarLoading(true);
    // Meeting invites from synced Mail (Graph Mail), not Graph calendar — works for all users with mail sync.
    api
      .getDashboardCalendarEvents(21, null, "mail")
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

  const refreshMeetingsFromMailbox = useCallback(async () => {
    if (status !== "authenticated") return;
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      // Meetings panel refresh should fetch recent mailbox mail first (Inbox + Sent),
      // then reload meeting events from synced messages.
      await api.triggerBackfill({ days: 30 });
      await loadCalendar();
    } catch {
      setCalendarError("Could not refresh meetings from mailbox.");
      setCalendarLoading(false);
    }
  }, [api, status, loadCalendar]);

  const displayedCalendarEvents = useMemo(
    () => selectDashboardCalendarEvents(calendarEvents, new Date()),
    [calendarEvents]
  );

  const calendarGroups = useMemo(() => {
    const byDate = new Map<string, { label: string; events: CalendarEventOut[] }>();
    displayedCalendarEvents.forEach((ev) => {
      const d = parseGraphDateTime(ev.start?.dateTime);
      const key = d ? d.toISOString().slice(0, 10) : "unknown";
      const label = d
        ? d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
        : "Unknown date";
      const row = byDate.get(key) ?? { label, events: [] };
      row.events.push(ev);
      byDate.set(key, row);
    });
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [displayedCalendarEvents]);

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventOut[]>();
    displayedCalendarEvents.forEach((ev) => {
      const d = parseGraphDateTime(ev.start?.dateTime);
      if (!d) return;
      const key = toDateKey(d);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    });
    for (const [, list] of map) {
      list.sort((a, b) => {
        const ta = parseGraphDateTime(a.start?.dateTime)?.getTime() ?? 0;
        const tb = parseGraphDateTime(b.start?.dateTime)?.getTime() ?? 0;
        return ta - tb;
      });
    }
    return map;
  }, [displayedCalendarEvents]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonthStart.getFullYear(), calendarMonthStart.getMonth(), 1);
    const monthStartDow = firstDay.getDay(); // 0 Sunday
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - monthStartDow);
    return Array.from({ length: 42 }).map((_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const key = toDateKey(d);
      return {
        date: d,
        key,
        inMonth: d.getMonth() == calendarMonthStart.getMonth(),
        count: meetingsByDate.get(key)?.length ?? 0,
      };
    });
  }, [calendarMonthStart, meetingsByDate]);

  const selectedMeetings = useMemo(
    () => meetingsByDate.get(selectedMeetingDateKey) ?? [],
    [meetingsByDate, selectedMeetingDateKey]
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
    api.getMyProjects().then((r) => setMyProjects(r.projects ?? [])).catch(() => setMyProjects([]));
  }, [status, api]);

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
    { title: "Queue Size", value: loadingMetrics ? "—" : (metrics?.queueSize ?? 0), subtitle: "Your tasks pending" },
    { title: "Workers", value: loadingMetrics ? "—" : `${metrics?.activeWorkers ?? 0} active`, subtitle: "Active workers" },
    { title: "Classified", value: loadingMetrics ? "—" : `${metrics?.totalClassified ?? 0} / ${metrics?.totalEmails ?? 0}`, subtitle: "Total emails" },
  ];

  const dashboardTourSteps = useMemo<DashboardTourStep[]>(
    () => [
      {
        title: "Sync action cards",
        description: "These cards control inbox sync and AI classification. Start with Sync 1 day or Sync 7 days for routine use.",
        target: syncActionsRef,
      },
      {
        title: "KPI summary cards",
        description: "These four cards show key status: emails today, queue size, active workers, and classification progress.",
        target: kpiCardsRef,
      },
      {
        title: "Time-Based Activity Map",
        description: "Use daily/weekly/monthly/yearly toggles to inspect patterns and trends in email activity.",
        target: activityMapRef,
      },
      {
        title: "Departments and teams",
        description: "Use this card to expand each department and see members, reporting structure, and team distribution.",
        target: departmentsCardRef,
      },
      {
        title: "Meetings and calendar",
        description: "This calendar panel shows meeting invites. Use Refresh, month navigation, and date selection to review schedules.",
        target: meetingsCardRef,
      },
    ],
    []
  );
  const currentTour = dashboardTourSteps[dashboardTourStep] ?? null;
  const isFirstTourStep = dashboardTourStep === 0;
  const isLastTourStep = dashboardTourStep >= dashboardTourSteps.length - 1;
  const isActiveTourSection = (idx: number) => dashboardTourOpen && dashboardTourStep === idx;
  const isBlurredTourSection = (idx: number) => dashboardTourOpen && dashboardTourStep !== idx;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (searchParams.get("tour") === "1") {
      setDashboardTourOpen(true);
      setDashboardTourStep(0);
    }
  }, [status, searchParams]);

  useEffect(() => {
    if (!dashboardTourOpen) return;
    const el = currentTour?.target.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [dashboardTourOpen, dashboardTourStep, currentTour]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8">
      <header className="">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Dashboard</h1>
      </header>

      {(metricsError || emailsError) && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {[metricsError, emailsError].filter(Boolean).join(" • ")} — Database or backend may be unavailable.
        </p>
      )}
      {backfillStatus && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{backfillStatus}</p>
      )}
      {dashboardTourOpen && currentTour && (
        <div className="sticky top-3 z-40 rounded-xl border border-neutral-700 bg-black/95 p-4 shadow-lg backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
            Dashboard walkthrough ({dashboardTourStep + 1}/{dashboardTourSteps.length})
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{currentTour.title}</p>
          <p className="mt-1 text-sm text-neutral-200">{currentTour.description}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Scroll to the highlighted section, then click next to continue.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-neutral-600 bg-black text-white hover:bg-neutral-900"
              disabled={isFirstTourStep}
              onClick={() => setDashboardTourStep((s) => Math.max(0, s - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isLastTourStep ? "default" : "outline"}
              className={cn(
                isLastTourStep
                  ? "bg-white text-black hover:bg-neutral-200"
                  : "border-neutral-600 bg-black text-white hover:bg-neutral-900"
              )}
              onClick={() => {
                if (isLastTourStep) setDashboardTourStep(0);
                else setDashboardTourStep((s) => Math.min(dashboardTourSteps.length - 1, s + 1));
              }}
            >
              {isLastTourStep ? "Restart" : "Next"}
            </Button>
            {isLastTourStep && (
              <Link href="/emails?walkthrough=1">
                <Button type="button" size="sm" className="bg-white text-black hover:bg-neutral-200">
                  Open next toggle walkthrough
                </Button>
              </Link>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-neutral-200 hover:bg-neutral-900 hover:text-white"
              onClick={() => setDashboardTourOpen(false)}
            >
              Close tour
            </Button>
          </div>
        </div>
      )}
      {!metricsError && !emailsError && emails.length === 0 && (metrics?.emailsIngestedToday ?? 0) === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Why no emails?</p>
          <p className="mt-1 text-xs">Ensure PostgreSQL, Redis, and Celery worker are running, then use <strong>Sync 1 day</strong> or <strong>Sync 7 days</strong> below.</p>
        </div>
      )}

      {/* Sync actions: full-width row of cards that grow to fill space */}
      <section
        ref={syncActionsRef}
        className={cn(
          "flex min-w-0 flex-col gap-4",
          isActiveTourSection(0) && "rounded-xl ring-2 ring-indigo-400/70",
          isBlurredTourSection(0) && "opacity-55"
        )}
      >
        <div className="flex w-full min-w-0 flex-wrap items-stretch gap-3 sm:gap-4 xl:flex-nowrap xl:gap-5">
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
                className="flex min-h-[118px] min-w-[140px] flex-1 basis-0 flex-col items-center justify-center gap-3 rounded-2xl border border-white/70 bg-gradient-to-br from-white to-[#eef5ff] px-4 py-5 text-center shadow-md shadow-sky-100/60 transition duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900/70 dark:from-neutral-900 dark:to-neutral-900 dark:hover:border-neutral-600 dark:hover:shadow-none"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm dark:from-indigo-600 dark:to-sky-600">
                  <Icon className="h-10 w-10" />
                </div>
                <span className="text-sm font-medium leading-snug text-neutral-800 dark:text-neutral-200">{title}</span>
              </button>
            );
          })}

          <div className="flex min-h-[118px] min-w-[min(100%,260px)] flex-[1.35] basis-0 flex-col justify-center gap-3 rounded-2xl border border-white/70 bg-gradient-to-br from-white to-[#edf8ff] px-4 py-5 shadow-md shadow-cyan-100/60 dark:border-neutral-700 dark:bg-neutral-900/70 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                <Calendar className="h-6 w-6" />
              </div>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Sync mails by date range</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
              <div className="relative min-w-0 flex-1">
                {!syncFromDate && (
                  <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-neutral-500 dark:text-neutral-400">
                    From
                  </span>
                )}
                <input
                  type="date"
                  value={syncFromDate}
                  onChange={(e) => setSyncFromDate(e.target.value)}
                  className={cn(
                    "h-10 min-w-0 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100",
                    !syncFromDate && "text-transparent"
                  )}
                  aria-label="Mail sync from date"
                />
              </div>
              <div className="relative min-w-0 flex-1">
                {!syncToDate && (
                  <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-neutral-500 dark:text-neutral-400">
                    To
                  </span>
                )}
                <input
                  type="date"
                  value={syncToDate}
                  onChange={(e) => setSyncToDate(e.target.value)}
                  className={cn(
                    "h-10 min-w-0 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100",
                    !syncToDate && "text-transparent"
                  )}
                  aria-label="Mail sync to date"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={onSyncByDateRange}
              disabled={syncRangeLoading || loadingMetrics}
              className="h-10 w-full bg-gradient-to-r from-indigo-600 to-sky-600 text-sm text-white hover:from-indigo-700 hover:to-sky-700"
            >
              {syncRangeLoading ? "Syncing mails…" : "Run mail sync"}
            </Button>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <section
        ref={kpiCardsRef}
        className={cn(
          "grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4",
          isActiveTourSection(1) && "rounded-xl ring-2 ring-indigo-400/70 p-1",
          isBlurredTourSection(1) && "opacity-55"
        )}
      >
        {kpiCards.map(({ title, value, subtitle }) => (
          <div
            key={title}
            className="relative rounded-2xl border border-white/80 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9] p-5 text-white shadow-lg shadow-blue-200/70 transition-transform duration-300 hover:-translate-y-0.5 dark:border-neutral-700 dark:bg-neutral-900/60 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 dark:shadow-none"
          >
            <button type="button" className="absolute right-2 top-2 rounded p-1 text-white/70 hover:bg-white/15 hover:text-white dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium text-white/80 dark:text-neutral-400">{title}</p>
            <p className="mt-1 text-3xl font-semibold text-white dark:text-neutral-100">{value}</p>
            <p className="mt-0.5 text-xs text-white/75 dark:text-neutral-400">{subtitle}</p>
          </div>
        ))}
      </section>

      {/* Time-Based Activity Map + right column */}
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div
          ref={activityMapRef}
          className={cn(
            "lg:col-span-2",
            isActiveTourSection(2) && "rounded-xl ring-2 ring-indigo-400/70 p-1",
            isBlurredTourSection(2) && "opacity-55"
          )}
        >
          <section className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-[#f7fbff] p-5 shadow-md shadow-slate-100/70 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
        <div
          ref={rightColumnRef}
          className={cn(
            "flex flex-col gap-6",
            dashboardTourOpen && ![3, 4].includes(dashboardTourStep) && "opacity-55"
          )}
        >
          {myProjects.length > 0 && (
            <div className="rounded-3xl border border-neutral-100 bg-gradient-to-br from-white to-[#f8fbff] p-5 shadow-md shadow-neutral-100/70 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">My projects</h2>
                <button type="button" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
              <ul className="space-y-2">
                {myProjects.slice(0, 6).map((p) => (
                  <li key={p.projectId} className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{p.projectName}</p>
                      <span className="rounded bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        {p.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Team: {p.teamName ?? "—"} · Role: {p.role ?? "—"}
                    </p>
                    {p.responsibilities && (
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                        {p.responsibilities}
                      </p>
                    )}
                    {p.structure?.notes && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {p.structure.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {me?.isAdmin ? (
            <div
              ref={departmentsCardRef}
              className={cn(
                "overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50/90 p-5 shadow-md shadow-indigo-100/50 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none",
                isActiveTourSection(3) && "ring-2 ring-indigo-400/70",
                isBlurredTourSection(3) && "opacity-55"
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-indigo-100/90 pb-3 dark:border-neutral-700">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Departments & Teams</h2>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-indigo-500 hover:bg-white/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  aria-label="More"
                >
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
                <ul className="space-y-2">
                  {byDepartment.map(({ department, teamName, users }) => {
                    const isExpanded = expandedDepartment === department;
                    return (
                      <li key={department}>
                        <button
                          type="button"
                          onClick={() => setExpandedDepartment(isExpanded ? null : department)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition",
                            isExpanded
                              ? "border-indigo-300 bg-white/90 text-indigo-950 shadow-sm dark:border-indigo-500/40 dark:bg-neutral-800/80 dark:text-neutral-100"
                              : "border-indigo-100/80 bg-white/60 text-neutral-900 hover:border-indigo-200 hover:bg-white/90 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-100 dark:hover:border-neutral-600"
                          )}
                        >
                          <span className="min-w-0 truncate">{department}</span>
                          <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300">
                            {users.length} member{users.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="ml-1 mt-2 rounded-xl border border-indigo-200/80 bg-gradient-to-b from-white/90 to-indigo-50/40 dark:border-neutral-600 dark:from-neutral-900 dark:to-neutral-900/80">
                            <p className="border-b border-indigo-100/90 px-3 py-2 text-xs font-medium text-indigo-800 dark:border-neutral-700 dark:text-indigo-200">
                              Team: {teamName}
                            </p>
                            <ul className="divide-y divide-indigo-100/70 dark:divide-neutral-700">
                              {users.length === 0 ? (
                                <li className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">No members</li>
                              ) : (
                                users.map((u) => {
                                  const name = u.displayName ?? u.email.split("@")[0] ?? u.email;
                                  const initials = name.split(/[\s@]/).filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?";
                                  return (
                                    <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-xs font-semibold text-white shadow-sm">
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
            <div
              ref={departmentsCardRef}
              className={cn(
                "overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50/90 p-5 shadow-md shadow-indigo-100/50 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none",
                isActiveTourSection(3) && "ring-2 ring-indigo-400/70",
                isBlurredTourSection(3) && "opacity-55"
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-indigo-100/90 pb-3 dark:border-neutral-700">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Reporting manager</h2>
                  <p className="mt-0.5 text-[11px] text-indigo-700/80 dark:text-neutral-300">Your org line and department.</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-indigo-500 hover:bg-white/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  aria-label="More"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-indigo-100/80 bg-white/70 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-neutral-400">You report to</p>
                  <p className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {me?.reportingManager
                      ? `${me.reportingManager.displayName ?? me.reportingManager.email} (${me.reportingManager.email})`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-100/80 bg-white/70 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-neutral-400">Department</p>
                  <p className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">{me?.department ?? "—"}</p>
                </div>
              </div>
            </div>
          )}
          <div
            ref={meetingsCardRef}
            className={cn(
              "overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-5 shadow-md shadow-sky-100/60 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none",
              isActiveTourSection(4) && "ring-2 ring-sky-400/70",
              isBlurredTourSection(4) && "opacity-55"
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-sky-100/90 pb-3 dark:border-neutral-700">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Meetings</h2>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-sky-200 bg-white/80 p-2 text-sky-600 shadow-sm transition hover:bg-sky-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                aria-label="Refresh calendar"
                onClick={refreshMeetingsFromMailbox}
              >
                <RefreshCw className={`h-4 w-4 ${calendarLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            {calendarError && (
              <p className="mb-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {calendarError}
              </p>
            )}
            {calendarLoading && calendarEvents.length === 0 && !calendarError && (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-xl bg-sky-100/80 dark:bg-neutral-700" />
                <div className="h-10 animate-pulse rounded-xl bg-sky-50 dark:bg-neutral-800" />
              </div>
            )}
            {!calendarLoading && !calendarError && displayedCalendarEvents.length === 0 && (
              <p className="rounded-xl border border-sky-100/80 bg-white/60 px-3 py-2.5 text-xs text-sky-900/80 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                No meeting invites found for this window. Sync mail from History so invites can appear here.
              </p>
            )}
            {displayedCalendarEvents.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-sky-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    onClick={() =>
                      setCalendarMonthStart((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                    }
                  >
                    Prev
                  </button>
                  <p className="text-xs font-semibold text-sky-900 dark:text-neutral-100">
                    {calendarMonthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </p>
                  <button
                    type="button"
                    className="rounded-lg border border-sky-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    onClick={() =>
                      setCalendarMonthStart((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                    }
                  >
                    Next
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 rounded-lg bg-sky-100/70 px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:border dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((wd) => (
                    <div key={wd} className="py-1">{wd}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((d) => {
                    const isSelected = d.key === selectedMeetingDateKey;
                    const isToday = d.key === toDateKey(new Date());
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setSelectedMeetingDateKey(d.key)}
                        className={`relative min-h-[46px] rounded-lg border px-1 py-1 text-left text-[11px] transition ${d.inMonth
                          ? "border-sky-200 bg-white/90 text-neutral-800 shadow-[0_1px_0_rgba(14,165,233,0.08)] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                          : "border-sky-100/90 bg-sky-50/60 text-sky-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500"
                          } ${isSelected
                            ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:border-sky-500/50 dark:bg-neutral-700 dark:ring-offset-neutral-900"
                            : "hover:border-sky-300 hover:bg-sky-50/80 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
                          }`}
                      >
                        <span className={`${isToday ? "font-bold text-sky-700 dark:text-sky-300" : ""}`}>
                          {d.date.getDate()}
                        </span>
                        {d.count > 0 && (
                          <span className="absolute bottom-1 right-1 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 px-1.5 text-[10px] font-medium text-white shadow-sm">
                            {d.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-neutral-200">
                    {selectedMeetings.length > 0
                      ? `Meetings on ${selectedMeetingDateKey}`
                      : `No meetings on ${selectedMeetingDateKey}`}
                  </p>
                  {selectedMeetings.map((ev) => (
                    <li
                      key={ev.id ?? `${ev.subject}-${ev.start?.dateTime}`}
                      className={`list-none rounded-xl border border-sky-100/90 bg-white/75 p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/60 ${ev.isCancelled ? "opacity-75" : ""
                        }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p
                          className={`min-w-0 flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100 ${ev.isCancelled ? "line-through" : ""
                            }`}
                        >
                          {ev.subject}
                        </p>
                        {!ev.isCancelled && (
                          <span className="shrink-0 rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            {formatMeetingTimeRange(ev)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        Scheduled: {formatMomTimeRange(ev)}
                      </p>
                      {ev.location ? (
                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{ev.location}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ev.joinUrl && !ev.isCancelled && (
                          <a
                            href={ev.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-sky-600 to-indigo-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:from-sky-700 hover:to-indigo-700 dark:from-sky-500 dark:to-indigo-500"
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
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline dark:text-neutral-200"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open in Outlook
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
