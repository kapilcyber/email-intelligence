"use client";

import { motion } from "framer-motion";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";
import { chartTooltipProps, useChartTheme } from "@/lib/use-chart-theme";
import { formatMomTimeRange } from "@/lib/mom-eligibility";
import { CLASSIFY_BATCH_SUMMARY_EVENT } from "@/lib/classify-batch-summary-event";
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
  FileStack,
  ClipboardList,
  ExternalLink,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
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

type DashboardTourStep = {
  title: string;
  description: string;
  target: { current: HTMLDivElement | null };
};

/** All mail in the user’s mailbox (no date window). Same payload drives KPIs and distribution charts. */
function loadMetrics(
  api: ReturnType<typeof getApi>,
  setMetrics: (m: DashboardMetrics | null) => void,
  setMetricsError: (e: string | null) => void,
  setLoading: (b: boolean) => void,
  options?: { silent?: boolean }
) {
  const silent = options?.silent ?? false;
  if (!silent) setLoading(true);
  api
    .getDashboardMetrics(undefined)
    .then((r) => {
      setMetrics(r);
      setMetricsError(null);
    })
    .catch(() => setMetricsError("Failed to load metrics"))
    .finally(() => {
      if (!silent) setLoading(false);
    });
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
  if (!start && !end) return "-";
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

function useNarrowCharts(maxWidthPx = 639) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const fn = () => setNarrow(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [maxWidthPx]);
  return narrow;
}

/**
 * Recharts' ResponsiveContainer can see width 0 under flex/grid + min-w-0, producing NaN SVG attrs in React 19.
 * Measure the wrapper and pass explicit pixel width/height to the chart.
 */
function MeasuredChart({
  height,
  children,
}: {
  height: number;
  children: (dims: { width: number; height: number }) => ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w < 2 || h < 2 || !Number.isFinite(w) || !Number.isFinite(h)) {
      setDims(null);
      return;
    }
    setDims((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  useLayoutEffect(() => {
    const schedule = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(measure);
      });
    };
    schedule();
  }, [height, measure]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(measure);
      });
    };
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [height, measure]);

  return (
    <div
      ref={wrapRef}
      className="w-full min-w-[160px] max-w-full"
      style={{ height }}
    >
      {dims ? (
        children(dims)
      ) : (
        <div
          className="h-full w-full rounded-lg bg-neutral-100/40 dark:bg-neutral-800/40"
          aria-hidden
        />
      )}
    </div>
  );
}

function DashboardAiChartsEmpty({
  onClassifyAll,
  onMetricsRefresh,
  classifyLoading,
}: {
  onClassifyAll?: () => Promise<void>;
  onMetricsRefresh?: () => void;
  classifyLoading: boolean;
}) {
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleClick = () => {
    if (!onClassifyAll) return;
    setClassifyMessage(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    void onClassifyAll()
      .then(() => {
        setClassifyMessage(
          "Classification started. This may take a few minutes. Metrics will refresh automatically while charts populate."
        );
        if (onMetricsRefresh) {
          onMetricsRefresh();
          pollRef.current = setInterval(() => {
            onMetricsRefresh();
          }, 1500);
          setTimeout(() => {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }, 120000);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to enqueue. Is the backend running?";
        setClassifyMessage(msg);
      });
  };
  return (
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900/30">
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        No classified emails yet. Existing emails were synced before AI was enabled - run <strong>Classify all</strong> once to add summary, category, and priority. New emails will be classified automatically.
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
  onMetricsRefresh,
  classifyLoading,
  isAdmin = false,
  showTeamMemberCharts = true,
}: {
  api: ReturnType<typeof getApi>;
  metrics: DashboardMetrics | null;
  loading: boolean;
  onClassifyAll?: () => Promise<void>;
  onMetricsRefresh?: () => void;
  classifyLoading: boolean;
  isAdmin?: boolean;
  /** Escalations / leads per-mailbox charts (hidden for Member role). */
  showTeamMemberCharts?: boolean;
}) {
  const [escalationByUser, setEscalationByUser] = useState<UserEscalationCountOut[] | null>(null);
  const [leadCountsByUser, setLeadCountsByUser] = useState<UserLeadCountOut[] | null>(null);
  const chart = useChartTheme();
  const tt = chartTooltipProps(chart);
  const narrow = useNarrowCharts(639);
  const chartBoxH = narrow ? 240 : 320;
  const axisTick = { fontSize: narrow ? 9 : 10, fill: chart.axis };
  const axisTickMuted = { fontSize: narrow ? 9 : 10, fill: chart.axisMuted };
  /** Margins must cover YAxis `width` or Recharts computes negative plot size → NaN (worse on desktop with wider axes). */
  const marginCategory = narrow
    ? { top: 10, right: 10, bottom: 44, left: 36 }
    : { top: 12, right: 16, bottom: 40, left: 52 };
  const marginStandard = narrow
    ? { top: 8, right: 8, bottom: 32, left: 8 }
    : { top: 8, right: 16, bottom: 16, left: 52 };
  const marginEscalation = narrow
    ? { top: 8, right: 8, left: 8, bottom: 52 }
    : { top: 8, right: 16, left: 52, bottom: 56 };

  useEffect(() => {
    if (!showTeamMemberCharts) {
      setEscalationByUser([]);
      setLeadCountsByUser([]);
      return;
    }
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
  }, [isAdmin, api, showTeamMemberCharts]);

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

  const chartsBlocking = metrics === null && loading;

  if (chartsBlocking) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900/30">
        <div
          className="w-full min-w-0 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700"
          style={{ height: chartBoxH }}
        />
      </section>
    );
  }

  if (!hasAny) {
    return (
      <DashboardAiChartsEmpty
        onClassifyAll={onClassifyAll}
        onMetricsRefresh={onMetricsRefresh}
        classifyLoading={classifyLoading}
      />
    );
  }

  return (
    <section className="min-w-0 space-y-4 sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
        <div className="min-w-0 rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-3 shadow-md shadow-sky-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-neutral-600 ring-1 ring-sky-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700">
              By category
            </span>
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Emails by category (KPI)
            </h3>
          </div>
          <MeasuredChart height={chartBoxH}>
            {({ width, height }) => (
              <BarChart width={width} height={height} data={categoryKpiData} margin={marginCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="category"
                  tick={axisTick}
                  interval={narrow ? "preserveStartEnd" : 0}
                  angle={narrow ? -20 : 0}
                  textAnchor={narrow ? "end" : "middle"}
                  height={narrow ? 36 : 30}
                />
                <YAxis orientation="left" width={narrow ? 28 : 44} tick={axisTickMuted} />
                <Tooltip
                  {...tt}
                  contentStyle={{ ...tt.contentStyle, borderRadius: 8 }}
                  formatter={(value: number, _name: string, item: { payload?: { pct?: number } }) => {
                    const pct = item.payload?.pct;
                    return [
                      pct !== undefined ? `${value} (${pct}% of total)` : String(value),
                      "Email count",
                    ];
                  }}
                  labelFormatter={(label) => `Category: ${label}`}
                />
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  wrapperStyle={{
                    paddingTop: narrow ? 6 : 8,
                    color: chart.axis,
                    fontSize: narrow ? 10 : 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Email count"
                  fill="#22d3ee"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive
                  animationDuration={900}
                />
              </BarChart>
            )}
          </MeasuredChart>
          <p className="mt-2 text-left text-[10px] text-neutral-500 dark:text-neutral-400">
            Showing {categoryKpiData.length} categor{categoryKpiData.length === 1 ? "y" : "ies"}.
          </p>
        </div>
        <div className="min-w-0 rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50 p-3 shadow-md shadow-violet-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Emails by priority
          </h3>
          {priorityData.length > 0 ? (
            <MeasuredChart height={chartBoxH}>
              {({ width, height }) => (
                <AreaChart width={width} height={height} data={prioritySeriesData} margin={marginStandard}>
                  <defs>
                    <linearGradient id="priority-area-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={chart.isDark ? 0.55 : 0.45} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={chart.isDark ? 0.12 : 0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                  <XAxis
                    dataKey="name"
                    tick={axisTick}
                    interval={narrow ? "preserveStartEnd" : 0}
                    angle={narrow ? -25 : 0}
                    textAnchor={narrow ? "end" : "middle"}
                    height={narrow ? 40 : 30}
                  />
                  <YAxis allowDecimals={false} width={narrow ? 28 : 44} tick={axisTickMuted} />
                  <Tooltip
                    {...tt}
                    contentStyle={{ ...tt.contentStyle, borderRadius: 8 }}
                    formatter={(value: number, _name: string, props: { payload?: { name?: string } }) => [
                      value,
                      props.payload?.name ?? "Priority",
                    ]}
                  />
                  <Legend wrapperStyle={{ color: chart.axis, fontSize: narrow ? 10 : 12 }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Priority count"
                    stroke="#7c3aed"
                    strokeWidth={narrow ? 2 : 3}
                    fill="url(#priority-area-fill)"
                    isAnimationActive
                    animationDuration={900}
                  />
                  {!narrow && (
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
                  )}
                </AreaChart>
              )}
            </MeasuredChart>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No priority data yet
            </p>
          )}
        </div>
        {showTeamMemberCharts && (
        <>
        <div className="min-w-0 rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50 to-amber-50 p-3 shadow-md shadow-orange-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-4">
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
            <div
              className="w-full min-w-0 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700"
              style={{ height: chartBoxH }}
            />
          ) : memberEscalationChartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No escalation emails per mailbox yet.
            </p>
          ) : (
            <MeasuredChart height={chartBoxH}>
              {({ width, height }) => (
                <LineChart width={width} height={height} data={memberEscalationChartData} margin={marginEscalation}>
                  <defs>
                    <linearGradient id="esc-line-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={chart.isDark ? 0.45 : 0.35} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={chart.isDark ? 0.1 : 0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: narrow ? 8 : 10, fill: chart.axis }}
                    tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
                    angle={narrow ? -55 : -40}
                    textAnchor="end"
                    height={narrow ? 52 : 56}
                    interval={0}
                  />
                  <YAxis
                    width={narrow ? 26 : 44}
                    tick={axisTickMuted}
                    allowDecimals={false}
                  />
                  <Tooltip
                    {...tt}
                    contentStyle={{ ...tt.contentStyle, borderRadius: 8 }}
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
                    strokeWidth={narrow ? 2 : 3}
                    dot={{ r: narrow ? 3 : 4, fill: "#ea580c" }}
                    activeDot={{ r: narrow ? 5 : 6 }}
                    isAnimationActive
                    animationDuration={1100}
                  />
                </LineChart>
              )}
            </MeasuredChart>
          )}
        </div>
        <div className="min-w-0 rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-cyan-50 p-3 shadow-md shadow-indigo-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Leads by team member
            </h3>
            <Link
              href={isAdmin ? "/admin/leads" : "/leads"}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Open Leads →
            </Link>
          </div>
          {leadCountsByUser === null ? (
            <div
              className="w-full min-w-0 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700"
              style={{ height: chartBoxH }}
            />
          ) : memberLeadChartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No lead emails per mailbox yet.
            </p>
          ) : (
            <MeasuredChart height={chartBoxH}>
              {({ width, height }) => (
                <RadarChart
                  width={width}
                  height={height}
                  data={memberLeadChartData}
                  outerRadius={narrow ? "58%" : "72%"}
                >
                  <PolarGrid stroke={chart.polarGrid} />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fontSize: narrow ? 8 : 10, fill: chart.axis }}
                    tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
                  />
                  <PolarRadiusAxis
                    allowDecimals={false}
                    tick={{ fontSize: narrow ? 8 : 10, fill: chart.axisMuted }}
                  />
                  <Tooltip
                    {...tt}
                    contentStyle={{ ...tt.contentStyle, borderRadius: 8 }}
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
              )}
            </MeasuredChart>
          )}
        </div>
        </>
        )}
      </div>
    </section>
  );
}

const syncActionTileBase =
  "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-gradient-to-br from-white to-[#eef5ff] text-center shadow-md shadow-sky-100/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900/70 dark:from-neutral-900 dark:to-neutral-900 dark:hover:border-neutral-600 dark:hover:shadow-none sm:rounded-2xl sm:gap-2 md:gap-3";

function DashboardSyncActionTile({
  title,
  icon: Icon,
  disabled,
  onClick,
}: {
  title: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        syncActionTileBase,
        "h-full min-h-[86px] w-full px-1.5 py-2 sm:min-h-[96px] sm:px-2 sm:py-2.5 md:min-h-[108px] md:px-2.5 md:py-3 xl:min-h-[148px] xl:px-3 xl:py-4"
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm dark:from-indigo-600 dark:to-sky-600 sm:h-14 sm:w-14 sm:rounded-xl md:h-[3.75rem] md:w-[3.75rem] xl:h-16 xl:w-16">
        <Icon className="h-[1.35rem] w-[1.35rem] sm:h-6 sm:w-6 md:h-7 md:w-7 xl:h-8 xl:w-8" aria-hidden />
      </div>
      <span className="line-clamp-2 max-w-full text-[0.75rem] font-semibold leading-snug text-neutral-800 dark:text-neutral-200 sm:text-[0.8125rem] md:text-sm xl:text-[0.9375rem]">
        {title}
      </span>
    </motion.button>
  );
}

function syncActionCardTitle(label: string) {
  if (label === "Sync all emails") return "Sync all mail";
  return "Classify all mail";
}

function DashboardPageContent() {
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
    role?: string;
  } | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserOut[] | null>(null);
  const [teams, setTeams] = useState<TeamOut[] | null>(null);
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null);
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
  const classifyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const classifyMetricsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const classifyPollMetaRef = useRef<{ since: string; last: number; stable: number } | null>(null);
  const syncActionsRef = useRef<HTMLDivElement>(null);
  const activityMapRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const departmentsCardRef = useRef<HTMLDivElement>(null);
  const meetingsCardRef = useRef<HTMLDivElement>(null);
  const [dashboardTourOpen, setDashboardTourOpen] = useState(false);
  const [dashboardTourStep, setDashboardTourStep] = useState(0);

  const adminEmailsList = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    []
  );
  const isEffectiveAdmin = useMemo(() => {
    const em = (session?.user?.email ?? "").trim().toLowerCase();
    return !!(me?.isAdmin || (adminEmailsList.length > 0 && adminEmailsList.includes(em)));
  }, [me?.isAdmin, adminEmailsList, session?.user?.email]);

  const showTeamMemberCharts = useMemo(() => {
    if (isEffectiveAdmin) return true;
    return (me?.role ?? "").trim() === "Manager";
  }, [isEffectiveAdmin, me?.role]);

  /** Admin only: enqueue Graph Deleted Items sync for all registered mailboxes (same job as former Admin → Deleted mail button). */
  const enqueueOutlookDeletedSyncForAdmins = useCallback(
    (days?: number) => {
      if (!isEffectiveAdmin) return;
      void api.syncOutlookDeleted(days !== undefined ? { days } : {}).catch(() => { });
    },
    [api, isEffectiveAdmin]
  );

  const loadCalendar = useCallback(() => {
    if (status !== "authenticated") return;
    setCalendarLoading(true);
    // Meeting invites from synced Mail (Graph Mail), not Graph calendar - works for all users with mail sync.
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
      // Meetings panel refresh should fetch recent mailbox mail first (full-folder Graph sync),
      // then reload meeting events from synced messages.
      await api.triggerBackfill({ days: 30 });
      enqueueOutlookDeletedSyncForAdmins(30);
      await loadCalendar();
    } catch {
      setCalendarError("Could not refresh meetings from mailbox.");
      setCalendarLoading(false);
    }
  }, [api, status, loadCalendar, enqueueOutlookDeletedSyncForAdmins]);

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
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics, { silent: true });
    loadEmails(api, setEmails, setEmailsError, setLoadingEmails);
  }, [api]);

  const refreshMetricsSilent = useCallback(() => {
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics, { silent: true });
  }, [api]);

  useEffect(() => {
    if (status !== "authenticated") {
      setMetrics(null);
      setMetricsError(null);
      return;
    }
    loadMetrics(api, setMetrics, setMetricsError, setLoadingMetrics, { silent: false });
  }, [status, api]);

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
          role: r.role ?? "",
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
      ordered.push({ department: "Unassigned", teamId: null, teamName: "-", users: unassigned });
    }
    return ordered;
  }, [teamMembers, teams, departmentOrder]);

  useEffect(() => {
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (syncStopRef.current) clearTimeout(syncStopRef.current);
      if (mePollRef.current) clearInterval(mePollRef.current);
      if (classifyPollRef.current) clearInterval(classifyPollRef.current);
      if (classifyMetricsPollRef.current) clearInterval(classifyMetricsPollRef.current);
    };
  }, []);

  const onSyncAllMail = () => {
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
      .triggerBackfill({ all: true })
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
        enqueueOutlookDeletedSyncForAdmins(90);
      })
      .catch((e) => setBackfillStatus(e instanceof Error ? e.message : "Sync failed."));
  };

  const [classifyLoading, setClassifyLoading] = useState(false);
  const onClassifyAll = (): Promise<void> => {
    setClassifyLoading(true);
    const since = new Date().toISOString();
    if (classifyPollRef.current) {
      clearInterval(classifyPollRef.current);
      classifyPollRef.current = null;
    }
    if (classifyMetricsPollRef.current) {
      clearInterval(classifyMetricsPollRef.current);
      classifyMetricsPollRef.current = null;
    }
    classifyPollMetaRef.current = { since, last: -1, stable: 0 };
    return api
      .triggerClassifyBackfill()
      .then(() => {
        enqueueOutlookDeletedSyncForAdmins();
        refresh();
        refreshMetricsSilent();
        classifyMetricsPollRef.current = setInterval(() => {
          refreshMetricsSilent();
        }, 1200);
        classifyPollRef.current = setInterval(() => {
          const meta = classifyPollMetaRef.current;
          if (!meta) return;
          void (async () => {
            try {
              const st = await api.getClassificationBatchStatus(meta.since);
              const c = st.classifiedSinceCount ?? 0;
              if (c === 0) {
                meta.stable = 0;
                return;
              }
              if (c === meta.last) meta.stable += 1;
              else {
                meta.last = c;
                meta.stable = 0;
              }
              if (meta.stable >= 3) {
                if (classifyPollRef.current) {
                  clearInterval(classifyPollRef.current);
                  classifyPollRef.current = null;
                }
                if (classifyMetricsPollRef.current) {
                  clearInterval(classifyMetricsPollRef.current);
                  classifyMetricsPollRef.current = null;
                }
                classifyPollMetaRef.current = null;
                const batchSince = meta.since;
                const sum = await api.postClassificationBatchSummary({ since: batchSince });
                if (sum.summary && (sum.count ?? 0) > 0) {
                  window.dispatchEvent(
                    new CustomEvent(CLASSIFY_BATCH_SUMMARY_EVENT, {
                      detail: { summary: sum.summary, count: sum.count },
                    })
                  );
                }
              }
            } catch {
              /* ignore transient errors while polling */
            }
          })();
        }, 2000);
        window.setTimeout(() => {
          if (classifyPollRef.current) {
            clearInterval(classifyPollRef.current);
            classifyPollRef.current = null;
          }
          if (classifyMetricsPollRef.current) {
            clearInterval(classifyMetricsPollRef.current);
            classifyMetricsPollRef.current = null;
          }
          classifyPollMetaRef.current = null;
        }, 120_000);
      })
      .finally(() => {
        setClassifyLoading(false);
      });
  };

  const actionCards = [
    { label: "Sync all emails", icon: FileStack, onClick: onSyncAllMail },
    { label: "Classify all", icon: ClipboardList, onClick: onClassifyAll },
  ];

  const pc = metrics?.priorityCounts;
  const urgentPriorityCount = (pc?.Critical ?? 0) + (pc?.High ?? 0);
  const kpiCards = [
    { title: "Emails Today", value: loadingMetrics ? "—" : (metrics?.emailsIngestedToday ?? 0), subtitle: "Received today" },
    {
      title: "Queue Size",
      value:
        loadingMetrics || metrics == null
          ? "—"
          : ((metrics.mailboxAiPending ?? metrics.queueSize) ?? 0),
      subtitle:
        loadingMetrics || metrics == null
          ? "Mails awaiting AI classification (live while classifying)"
          : `AI backlog · Celery tracked: ${metrics.queueSize ?? 0} · running: ${metrics.mailboxTasksActive ?? 0}`,
    },
    {
      title: "Critical & High",
      value: loadingMetrics ? "-" : urgentPriorityCount,
      subtitle: "Priority in your mailbox",
    },
    {
      title: "Classified",
      value: loadingMetrics ? "-" : `${metrics?.totalClassified ?? 0} / ${metrics?.totalEmails ?? 0}`,
      subtitle: "All mail in your mailbox",
    },
  ];

  const dashboardTourSteps = useMemo<DashboardTourStep[]>(
    () => [
      {
        title: "Sync & metrics",
        description:
          "Sync all mail pulls from Microsoft but only queues messages that are not already in the database. Classify all runs AI on pending messages. Queue Size shows mails still awaiting classification and updates Live while classification runs; Celery totals are shown in the subtitle.",
        target: syncActionsRef,
      },
      {
        title: "Charts",
        description: "Category, priority, and team views reflect all email in your synced mailbox.",
        target: activityMapRef,
      },
      {
        title: "Meetings and calendar",
        description: "This calendar panel shows meeting invites. Use Refresh, month navigation, and date selection to review schedules.",
        target: meetingsCardRef,
      },
      {
        title: "Departments and teams",
        description: "Use this card to expand each department and see members, reporting structure, and team distribution.",
        target: departmentsCardRef,
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
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4 sm:gap-6 md:gap-8">
      <header className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-2xl">
          Dashboard
        </h1>
      </header>

      {(metricsError || emailsError) && (
        <p className="break-words text-xs text-amber-600 dark:text-amber-400 sm:text-sm">
          {[metricsError, emailsError].filter(Boolean).join(" • ")} - Database or backend may be unavailable.
        </p>
      )}
      {backfillStatus && (
        <p className="break-words text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">{backfillStatus}</p>
      )}
      {dashboardTourOpen && currentTour && (
        <div className="sticky top-3 z-40 rounded-xl border border-neutral-700 bg-black/95 p-3 shadow-lg backdrop-blur sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-300 sm:text-xs">
            Dashboard walkthrough ({dashboardTourStep + 1}/{dashboardTourSteps.length})
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{currentTour.title}</p>
          <p className="mt-1 break-words text-xs text-neutral-200 sm:text-sm">{currentTour.description}</p>
          <p className="mt-1 text-[11px] text-neutral-400 sm:text-xs">
            Scroll to the highlighted section, then tap next to continue.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full border-neutral-600 bg-black text-white hover:bg-neutral-900 sm:w-auto"
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
                "w-full sm:w-auto",
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
              <Link href="/emails?walkthrough=1" className="block w-full sm:w-auto">
                <Button type="button" size="sm" className="w-full bg-white text-black hover:bg-neutral-200 sm:w-auto">
                  Open next walkthrough
                </Button>
              </Link>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full text-neutral-200 hover:bg-neutral-900 hover:text-white sm:w-auto"
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
          <p className="mt-1 break-words text-xs">
            Ensure PostgreSQL, Redis, and Celery worker are running, then use <strong>Sync all mail</strong> below.
          </p>
        </div>
      )}

      {/* Sync + classify + KPIs: 2-column on small screens, one row of 6 from md */}
      <section
        ref={syncActionsRef}
        className={cn(
          "grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-6 xl:grid-cols-6 xl:gap-5",
          isActiveTourSection(0) && "rounded-xl ring-2 ring-indigo-400/70 p-1",
          isBlurredTourSection(0) && "opacity-55"
        )}
      >
        {actionCards.map(({ label, icon, onClick }, i) => {
          const disabled =
            (label === "Classify all" && classifyLoading) || (label.startsWith("Sync") && loadingMetrics);
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
              className="flex min-h-0 min-w-0"
            >
              <DashboardSyncActionTile
                title={syncActionCardTitle(label)}
                icon={icon}
                disabled={disabled}
                onClick={onClick}
              />
            </motion.div>
          );
        })}
        {kpiCards.map(({ title, value }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (actionCards.length + i) * 0.1, duration: 0.5, ease: "easeOut" }}
            className="relative flex min-h-[86px] min-w-0 flex-col justify-center rounded-2xl border border-white/80 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9] p-3 text-white shadow-lg shadow-blue-200/70 transition-transform duration-300 hover:-translate-y-0.5 dark:border-neutral-700 dark:bg-neutral-900/60 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 dark:shadow-none sm:min-h-[96px] sm:p-4 md:min-h-[108px] md:p-4 xl:min-h-[148px] xl:p-5"
          >
            <p className="text-[0.65rem] font-medium leading-tight text-white/80 dark:text-neutral-400 sm:text-xs md:text-sm">
              {title}
            </p>
            <p className="mt-0.5 min-w-0 break-words text-base font-semibold tabular-nums leading-tight text-white dark:text-neutral-100 sm:text-lg md:text-xl xl:text-2xl">
              {value}
            </p>
          </motion.div>
        ))}
      </section>

      {/* Charts + right column */}
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3 lg:gap-8">
        <motion.div
          ref={activityMapRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
          className={cn(
            "min-w-0 lg:col-span-2",
            isActiveTourSection(1) && "rounded-xl ring-2 ring-indigo-400/70 p-1",
            isBlurredTourSection(1) && "opacity-55"
          )}
        >
          <section className="min-w-0 overflow-x-hidden rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-[#f7fbff] p-4 shadow-md shadow-slate-100/70 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-5 md:p-6">
            <DashboardAiCharts
              api={api}
              metrics={metrics}
              loading={loadingMetrics}
              onClassifyAll={onClassifyAll}
              onMetricsRefresh={refreshMetricsSilent}
              classifyLoading={classifyLoading}
              isAdmin={!!isEffectiveAdmin}
              showTeamMemberCharts={showTeamMemberCharts}
            />
          </section>
        </motion.div>
        <motion.div
          ref={rightColumnRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
          className={cn(
            "flex min-w-0 flex-col gap-4 sm:gap-6",
            dashboardTourOpen && ![2, 3].includes(dashboardTourStep) && "opacity-55"
          )}
        >
          <div
            ref={meetingsCardRef}
            className={cn(
              "min-w-0 overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-4 shadow-md shadow-sky-100/60 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-5",
              isActiveTourSection(2) && "ring-2 ring-sky-400/70",
              isBlurredTourSection(2) && "opacity-55"
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
            {!(calendarLoading && calendarEvents.length === 0 && !calendarError) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-1 sm:gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-sky-200 bg-white/80 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 sm:px-2.5 sm:text-xs"
                    onClick={() =>
                      setCalendarMonthStart((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                    }
                  >
                    Prev
                  </button>
                  <p className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold text-sky-900 dark:text-neutral-100 sm:text-xs">
                    {calendarMonthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-sky-200 bg-white/80 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 sm:px-2.5 sm:text-xs"
                    onClick={() =>
                      setCalendarMonthStart((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                    }
                  >
                    Next
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 rounded-lg bg-sky-100/70 px-0.5 py-1 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-sky-800 dark:border dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 sm:gap-1 sm:px-1 sm:text-[10px]">
                  {["S", "M", "T", "W", "T", "F", "S"].map((wd, i) => (
                    <div key={`${wd}-${i}`} className="py-0.5 sm:py-1">
                      <span className="sm:hidden">{wd}</span>
                      <span className="hidden sm:inline">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {calendarDays.map((d) => {
                    const isSelected = d.key === selectedMeetingDateKey;
                    const isToday = d.key === toDateKey(new Date());
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setSelectedMeetingDateKey(d.key)}
                        className={`relative min-h-[38px] rounded-md border px-0.5 py-0.5 text-left text-[10px] transition sm:min-h-[46px] sm:rounded-lg sm:px-1 sm:py-1 sm:text-[11px] ${d.inMonth
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
                <LenisScrollArea className="max-h-56 min-h-0 pr-1" contentClassName="space-y-2">
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
                          className={`min-w-0 flex-1 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100 ${ev.isCancelled ? "line-through" : ""
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
                </LenisScrollArea>
              </div>
            )}
          </div>
          {myProjects.length > 0 && (
            <div className="rounded-3xl border border-neutral-100 bg-gradient-to-br from-white to-[#f8fbff] p-4 shadow-md shadow-neutral-100/70 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-5">
              <div className="mb-4">
                <h2 className="min-w-0 text-sm font-semibold text-neutral-900 dark:text-neutral-100">My projects</h2>
              </div>
              <ul className="space-y-2">
                {myProjects.slice(0, 6).map((p) => (
                  <li key={p.projectId} className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {p.projectName}
                      </p>
                      <span className="rounded bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        {p.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Team: {p.teamName ?? "-"} · Role: {p.role ?? "-"}
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
                "min-w-0 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50/90 p-4 shadow-md shadow-indigo-100/50 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-5",
                isActiveTourSection(3) && "ring-2 ring-indigo-400/70",
                isBlurredTourSection(3) && "opacity-55"
              )}
            >
              <div className="mb-4 border-b border-indigo-100/90 pb-3 dark:border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Departments & Teams</h2>
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
                "min-w-0 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50/90 p-4 shadow-md shadow-indigo-100/50 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-5",
                isActiveTourSection(3) && "ring-2 ring-indigo-400/70",
                isBlurredTourSection(3) && "opacity-55"
              )}
            >
              <div className="mb-4 border-b border-indigo-100/90 pb-3 dark:border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Reporting manager</h2>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-indigo-100/80 bg-white/70 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-neutral-400">You report to</p>
                  <p className="mt-1 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {me?.reportingManager
                      ? (me.reportingManager.displayName?.trim() ||
                          me.reportingManager.email.split("@")[0] ||
                          "-")
                      : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-100/80 bg-white/70 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-neutral-400">Department</p>
                  <p className="mt-1 break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {me?.department ?? "-"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}
