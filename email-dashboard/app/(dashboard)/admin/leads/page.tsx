"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import { downloadAoAAsXlsx } from "@/lib/download-xlsx";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";
import { chartTooltipProps, useChartTheme } from "@/lib/use-chart-theme";
import type { EscalationLeadItem, TeamOut, UserLeadCountOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Info, Table2, Tags, Users } from "lucide-react";
import { DateRangePair } from "@/components/ui/date-range-pair";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts";

const DEFAULT_PAGE_SIZE = 20;
const CHART_PAGE_SIZE = 400;
const LEAD_LABELS = ["Hot", "Warm", "Cold"];
const LEAD_LABEL_FILL: Record<string, string> = {
  Hot: "#ef4444",
  Warm: "#f97316",
  Cold: "#22c55e",
  Other: "#64748b",
};

type ViewMode = "all" | "analytics" | "table";
type DateRange = "all" | "month" | "year" | "custom";

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

function getDateRangeFromPreset(preset: DateRange): string {
  const now = new Date();
  if (preset === "all") {
    return "";
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString().slice(0, 10);
  }
  if (preset === "year") {
    return `${now.getFullYear()}-01-01`;
  }
  return "";
}

export default function AdminLeadsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("");

  const [teams, setTeams] = useState<TeamOut[]>([]);
  const [userCounts, setUserCounts] = useState<UserLeadCountOut[]>([]);
  const [userCountsLoading, setUserCountsLoading] = useState(true);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [mailKindTab, setMailKindTab] = useState<"leads" | "retag">("leads");
  const [retagItems, setRetagItems] = useState<EscalationLeadItem[]>([]);
  const [retagTotal, setRetagTotal] = useState(0);
  const [retagPage, setRetagPage] = useState(1);
  const [items, setItems] = useState<EscalationLeadItem[]>([]);
  const [chartItems, setChartItems] = useState<EscalationLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromDate = dateRange === "custom" ? customFrom : getDateRangeFromPreset(dateRange);
  const toDate =
    dateRange === "custom"
      ? customTo.trim() || undefined
      : dateRange === "month" || dateRange === "year"
        ? new Date().toISOString().slice(0, 10)
        : undefined;
  const chart = useChartTheme();
  const tt = chartTooltipProps(chart);

  const teamNames = useMemo(() => teams.map((t) => t.name), [teams]);
  const selectedUser = useMemo(
    () => userCounts.find((u) => u.email === selectedUserEmail) ?? null,
    [userCounts, selectedUserEmail]
  );

  const loadUserCounts = () => {
    if (status !== "authenticated") return;
    setUserCountsLoading(true);
    api
      .getLeadCountsByUser()
      .then(setUserCounts)
      .catch(() => setError("Failed to load users"))
      .finally(() => setUserCountsLoading(false));
  };

  const loadTable = () => {
    if (status !== "authenticated" || !selectedUserEmail) return;
    setLoading(true);
    setError(null);
    api
      .getAdminLeadsForUser({
        mailbox: selectedUserEmail,
        page,
        pageSize,
        label: labelFilter || undefined,
        team: teamFilter || undefined,
        from: fromDate || undefined,
        to: toDate,
      })
      .then((r) => {
        setItems(r.leads);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load leads"))
      .finally(() => setLoading(false));
  };

  const loadAdminRetag = () => {
    if (status !== "authenticated" || !selectedUserEmail) return;
    setLoading(true);
    setError(null);
    api
      .getAdminRetagged({
        mailbox: selectedUserEmail,
        page: retagPage,
        pageSize,
        from: fromDate || undefined,
        to: toDate,
      })
      .then((r) => {
        setRetagItems(r.retagged);
        setRetagTotal(r.total);
      })
      .catch(() => setError("Failed to load ReTag list"))
      .finally(() => setLoading(false));
  };

  const loadCharts = () => {
    if (status !== "authenticated" || !selectedUserEmail) return;
    setChartLoading(true);
    api
      .getAdminLeadsForUser({
        mailbox: selectedUserEmail,
        page: 1,
        pageSize: CHART_PAGE_SIZE,
        label: labelFilter || undefined,
        team: teamFilter || undefined,
        from: fromDate || undefined,
        to: toDate,
      })
      .then((r) => setChartItems(r.leads))
      .catch(() => {})
      .finally(() => setChartLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated") {
      api.getTeams().then(setTeams).catch(() => {});
    }
  }, [status, api]);

  useEffect(() => {
    loadUserCounts();
  }, [status, api]);

  useEffect(() => {
    if (status !== "authenticated" || selectedUserEmail) return;
    const onFocus = () => loadUserCounts();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status, selectedUserEmail]);

  useEffect(() => {
    if (selectedUserEmail && mailKindTab === "leads") loadTable();
  }, [status, api, selectedUserEmail, page, pageSize, labelFilter, teamFilter, fromDate, toDate, mailKindTab]);

  useEffect(() => {
    if (selectedUserEmail && mailKindTab === "retag") loadAdminRetag();
  }, [status, api, selectedUserEmail, mailKindTab, retagPage, pageSize, fromDate, toDate]);

  useEffect(() => {
    if (
      selectedUserEmail &&
      mailKindTab === "leads" &&
      (viewMode === "all" || viewMode === "analytics")
    ) {
      loadCharts();
    }
  }, [status, api, selectedUserEmail, viewMode, labelFilter, teamFilter, fromDate, toDate, mailKindTab]);

  useEffect(() => {
    if (status !== "authenticated" || !selectedUserEmail) return;
    const id = window.setInterval(() => {
      if (mailKindTab === "leads") {
        loadTable();
        if (viewMode === "all" || viewMode === "analytics") loadCharts();
      } else {
        loadAdminRetag();
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [status, api, selectedUserEmail, page, pageSize, labelFilter, teamFilter, fromDate, toDate, viewMode, mailKindTab]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.subject ?? "").toLowerCase().includes(s) ||
          (i.sender ?? "").toLowerCase().includes(s) ||
          (i.id ?? "").toLowerCase().includes(s) ||
          (i.mailboxOwner ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [items, search]);

  const lineData = useMemo(() => {
    const byDate: Record<string, number> = {};
    chartItems.forEach((i) => {
      const key = i.receivedAt ? new Date(i.receivedAt).toISOString().slice(0, 10) : "";
      if (key) byDate[key] = (byDate[key] ?? 0) + 1;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [chartItems]);

  const labelBarData = useMemo(() => {
    const byLabel: Record<string, number> = {};
    LEAD_LABELS.forEach((l) => (byLabel[l] = 0));
    chartItems.forEach((i) => {
      const l = i.leadLabel || "Other";
      byLabel[l] = (byLabel[l] ?? 0) + 1;
    });
    return Object.entries(byLabel).map(([label, count]) => ({ label, count }));
  }, [chartItems]);

  const labelPieData = useMemo(() => labelBarData.filter((d) => d.count > 0), [labelBarData]);

  const teamNameValueData = useMemo(() => {
    const byTeam: Record<string, number> = {};
    chartItems.forEach((i) => {
      const t = i.assignedTeam || "Unassigned";
      byTeam[t] = (byTeam[t] ?? 0) + 1;
    });
    return Object.entries(byTeam).map(([name, value]) => ({ name, value }));
  }, [chartItems]);

  const teamBarChartData = useMemo(
    () => [...teamNameValueData].sort((a, b) => b.value - a.value),
    [teamNameValueData]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleExportTable = async () => {
    const rows: (string | number)[][] = [
      ["ID", "Subject", "Lead", "Created by", "Mail type", "Priority", "Date"],
      ...filteredItems.map((i) => [
        i.id,
        i.subject ?? "",
        i.leadLabel ?? "",
        i.mailboxOwner ?? i.sender ?? "",
        i.mailType ?? "—",
        i.priorityLabel ?? "",
        formatDate(i.receivedAt),
      ]),
    ];
    await downloadAoAAsXlsx(rows, "leads-table", "Leads");
  };

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4 md:gap-6 lg:gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <header className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-2xl">Leads</h1>
          {selectedUserEmail && (
            <p className="mt-1 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-sm">
              Mailbox:{" "}
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{selectedUserEmail}</span>
            </p>
          )}
        </header>
        {selectedUserEmail && (
          <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:shrink-0 sm:items-end">
            <div className="grid w-full grid-cols-2 gap-2 rounded-lg border border-neutral-200 p-1 dark:border-neutral-600 sm:flex sm:w-auto sm:gap-0 sm:p-0.5">
              <button
                type="button"
                onClick={() => (setMailKindTab("leads"), setPage(1))}
                className={cn(
                  "min-h-10 rounded-md px-3 py-2 text-xs font-medium sm:min-h-0 sm:py-1.5 sm:text-sm",
                  mailKindTab === "leads"
                    ? "bg-[#1E1E1E] text-white dark:bg-neutral-700"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                )}
              >
                Leads
              </button>
              <button
                type="button"
                onClick={() => (setMailKindTab("retag"), setRetagPage(1))}
                className={cn(
                  "flex min-h-10 items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-medium sm:min-h-0 sm:py-1.5 sm:text-sm",
                  mailKindTab === "retag"
                    ? "bg-[#1E1E1E] text-white dark:bg-neutral-700"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                )}
              >
                <Tags className="h-3.5 w-3.5 shrink-0" />
                ReTag
              </button>
            </div>
            {mailKindTab === "leads" && (
              <div className="flex w-full flex-col gap-1 rounded-lg border border-neutral-200 p-1 dark:border-neutral-600 sm:w-auto sm:inline-flex sm:flex-row sm:flex-wrap sm:p-0.5">
                {(["all", "analytics", "table"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "min-h-10 w-full rounded-md px-3 py-2 text-left text-xs font-medium capitalize sm:min-h-0 sm:w-auto sm:py-1.5 sm:text-sm",
                      viewMode === mode
                        ? "bg-[#1E1E1E] text-white dark:bg-neutral-700"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                    )}
                  >
                    {mode === "all" ? "All" : mode === "analytics" ? "Analytics only" : "Table only"}
                  </button>
                ))}
              </div>
            )}
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Select
                value={dateRange}
                onValueChange={(v) => {
                  setDateRange(v as DateRange);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-300 dark:border-neutral-600 sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="year">This year</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {dateRange === "custom" && (
                <div className="glass-surface w-full min-w-0 rounded-xl p-2 sm:p-3">
                  <DateRangePair
                    from={customFrom}
                    to={customTo}
                    onFromChange={(v) => {
                      setCustomFrom(v);
                      setPage(1);
                    }}
                    onToChange={(v) => {
                      setCustomTo(v);
                      setPage(1);
                    }}
                    className="w-full min-w-0"
                    fieldClassName="relative min-w-0 flex-1"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200/80 bg-red-50/90 p-3 text-sm text-red-800 backdrop-blur-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="break-words">{error}</p>
        </div>
      )}

      {!selectedUserEmail && (
        <section className="min-w-0 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-violet-50/90 p-4 shadow-md shadow-indigo-100/50 dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-6">
          <CardHeader className="p-0 pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              <Users className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              Users
            </CardTitle>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 md:hidden">Tap a user to open their mailbox leads.</p>
          </CardHeader>
          <CardContent className="p-0">
            {userCountsLoading ? (
              <Skeleton className="h-48 w-full rounded-lg sm:h-64" />
            ) : userCounts.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">No users found.</p>
            ) : (
              <>
                <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200/80 bg-white/50 dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/20 md:hidden">
                  {userCounts.map((u) => (
                    <li key={u.email}>
                      <button
                        type="button"
                        className="flex w-full min-w-0 flex-col gap-2 p-3 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100 dark:hover:bg-neutral-800/50 dark:active:bg-neutral-800"
                        onClick={() => {
                          setPage(1);
                          setSelectedUserEmail(u.email);
                        }}
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium text-neutral-900 dark:text-neutral-50">
                            {u.displayName ?? u.email.split("@")[0]}
                          </p>
                          <p className="break-words text-xs text-neutral-600 dark:text-neutral-400">{u.email}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {u.leadCount} leads
                          </span>
                          <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">View →</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="hidden min-w-0 md:block">
                  <LenisScrollArea
                    axis="horizontal"
                    className="rounded-xl border border-neutral-200/80 bg-white/40 [-webkit-overflow-scrolling:touch] dark:border-neutral-700 dark:bg-neutral-800/30"
                  >
                    <table className="min-w-[640px] w-full text-left text-sm">
                      <thead className="border-b border-neutral-200 bg-neutral-50/90 dark:border-neutral-700 dark:bg-neutral-800/50">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            User
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Email
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Lead count
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {userCounts.map((u) => (
                          <tr
                            key={u.email}
                            className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                            onClick={() => {
                              setPage(1);
                              setSelectedUserEmail(u.email);
                            }}
                          >
                            <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-50">
                              {u.displayName ?? u.email.split("@")[0]}
                            </td>
                            <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{u.email}</td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                {u.leadCount}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-blue-600 dark:text-blue-400">View leads →</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </LenisScrollArea>
                </div>
              </>
            )}
          </CardContent>
        </section>
      )}

      {selectedUserEmail && mailKindTab === "leads" && (
        <>
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        <div className="relative min-w-0 rounded-2xl border border-white/80 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9] p-4 text-white shadow-lg shadow-blue-200/70 transition-transform duration-300 hover:-translate-y-0.5 dark:border-neutral-700 dark:bg-neutral-900/60 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-5">
          <p className="text-sm font-medium text-white/80 dark:text-neutral-400">Total leads</p>
          <p className="mt-1 text-3xl font-semibold text-white dark:text-neutral-100">{total}</p>
          <p className="mt-0.5 text-xs text-white/75 dark:text-neutral-400">In selected mailbox</p>
          <Info className="absolute right-4 top-4 h-5 w-5 text-white/50 dark:text-neutral-500" aria-hidden />
        </div>
        <div className="relative min-w-0 rounded-2xl border border-white/80 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9] p-4 text-white shadow-lg shadow-blue-200/70 transition-transform duration-300 hover:-translate-y-0.5 dark:border-neutral-700 dark:bg-neutral-900/60 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-5">
          <p className="text-sm font-medium text-white/80 dark:text-neutral-400">By label</p>
          <p className="mt-1 text-3xl font-semibold text-white dark:text-neutral-100">{labelPieData.length}</p>
          <p className="mt-0.5 text-xs text-white/75 dark:text-neutral-400">Labels with leads in range</p>
        </div>
        <div className="relative min-w-0 rounded-2xl border border-white/80 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9] p-4 text-white shadow-lg shadow-blue-200/70 transition-transform duration-300 hover:-translate-y-0.5 dark:border-neutral-700 dark:bg-neutral-900/60 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-900 dark:shadow-none sm:col-span-2 sm:p-5 lg:col-span-1">
          <p className="text-sm font-medium text-white/80 dark:text-neutral-400">Teams</p>
          <p className="mt-1 text-3xl font-semibold text-white dark:text-neutral-100">{teamNameValueData.length}</p>
          <p className="mt-0.5 text-xs text-white/75 dark:text-neutral-400">Assigned teams in range</p>
        </div>
      </section>

      {(viewMode === "all" || viewMode === "analytics") && (
        <div className="flex min-w-0 flex-col gap-6 md:gap-8">
          <section className="min-w-0 rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-[#f7fbff] p-4 shadow-md shadow-slate-100/70 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-6">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
              Leads over time
            </h3>
            <p className="mb-3 text-[11px] text-slate-400 dark:text-neutral-500 sm:mb-4">
              Volume trend across the selected range
            </p>
            {chartLoading ? (
              <Skeleton className="h-[220px] w-full rounded-xl sm:h-[300px]" />
            ) : lineData.length === 0 ? (
              <p className="flex h-[220px] items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 sm:h-[300px]">
                No data for selected range
              </p>
            ) : (
              <div className="h-[220px] w-full min-w-0 sm:h-[300px] [&_.recharts-cartesian-axis-tick_text]:fill-slate-500 dark:[&_.recharts-cartesian-axis-tick_text]:fill-neutral-400">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={lineData} margin={{ top: 14, right: 14, left: 4, bottom: 6 }}>
                    <defs>
                      <linearGradient id="adminLeadsTimeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                        <stop offset="55%" stopColor="#16a34a" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#15803d" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="4 14"
                      vertical={false}
                      stroke={chart.gridSlate}
                      strokeOpacity={chart.isDark ? 0.9 : 0.45}
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: chart.axis }}
                      dy={6}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: chart.axisMuted }}
                      allowDecimals={false}
                      width={40}
                    />
                    <Tooltip {...tt} formatter={(v: number) => [`${v}`, "Leads"]} />
                    <Area type="natural" dataKey="count" name="Volume" stroke="none" fill="url(#adminLeadsTimeFill)" isAnimationActive animationDuration={900} />
                    <Line
                      type="natural"
                      dataKey="count"
                      name="Trend"
                      stroke="#15803d"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 6,
                        strokeWidth: 2,
                        stroke: chart.isDark ? "#27272a" : "#fff",
                        fill: "#166534",
                      }}
                      isAnimationActive
                      animationDuration={1000}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:gap-8">
            <section className="min-w-0 rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50 to-amber-50 p-4 shadow-md shadow-orange-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-6">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
                By lead label
              </h3>
              <p className="mb-3 text-[11px] text-slate-400 dark:text-neutral-500 sm:mb-4">
                Volume by label — column view
              </p>
              {chartLoading ? (
                <Skeleton className="h-[220px] w-full rounded-xl sm:h-[280px]" />
              ) : labelPieData.length === 0 ? (
                <p className="flex h-[220px] items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 sm:h-[280px]">
                  No leads in selected range
                </p>
              ) : (
                <div className="h-[220px] w-full min-w-0 sm:h-[280px] [&_.recharts-cartesian-axis-tick_text]:fill-slate-500 dark:[&_.recharts-cartesian-axis-tick_text]:fill-neutral-400">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={labelBarData} margin={{ top: 16, right: 8, left: -12, bottom: 4 }} barCategoryGap="18%">
                      <defs>
                        {labelBarData.map((d, i) => (
                          <linearGradient key={d.label} id={`lead-label-col-${i}`} x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor={LEAD_LABEL_FILL[d.label] ?? "#0ea5e9"} stopOpacity={0.55} />
                            <stop offset="100%" stopColor={LEAD_LABEL_FILL[d.label] ?? "#0ea5e9"} stopOpacity={1} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid
                        strokeDasharray="4 14"
                        vertical={false}
                        stroke={chart.gridSlate}
                        strokeOpacity={chart.isDark ? 0.85 : 0.35}
                      />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: chart.axis }}
                        interval={0}
                        angle={-12}
                        textAnchor="end"
                        height={44}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: chart.axisMuted }}
                        allowDecimals={false}
                        width={32}
                      />
                      <Tooltip {...tt} formatter={(v: number) => [`${v} leads`, "Count"]} />
                      <Bar dataKey="count" name="Leads" radius={[10, 10, 0, 0]} maxBarSize={52} isAnimationActive animationDuration={750}>
                        {labelBarData.map((d, i) => (
                          <Cell key={d.label} fill={`url(#lead-label-col-${i})`} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="top"
                          fill={chart.labelFill}
                          fontSize={11}
                          fontWeight={600}
                          formatter={(v: number) => (Number(v) > 0 ? String(v) : "")}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
            <section className="min-w-0 rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50 p-4 shadow-md shadow-violet-100/60 dark:border-neutral-800 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-none sm:p-6">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
                By assigned team
              </h3>
              <p className="mb-3 text-[11px] text-slate-400 dark:text-neutral-500 sm:mb-4">
                Ranked volume — horizontal comparison
              </p>
              {chartLoading ? (
                <Skeleton className="h-[220px] w-full rounded-xl sm:h-[280px]" />
              ) : teamNameValueData.length === 0 ? (
                <p className="flex h-[220px] items-center justify-center text-sm text-neutral-500 dark:text-neutral-400 sm:h-[280px]">
                  No data for selected range
                </p>
              ) : (
                <div className="h-[220px] w-full min-w-0 overflow-hidden sm:h-[280px] [&_.recharts-cartesian-axis-tick_text]:fill-slate-500 dark:[&_.recharts-cartesian-axis-tick_text]:fill-neutral-400">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={teamBarChartData}
                      margin={{ top: 8, right: 32, left: 4, bottom: 8 }}
                      barCategoryGap={14}
                    >
                      <defs>
                        <linearGradient id="adminLeadsTeamBar" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="4 14"
                        horizontal={false}
                        stroke={chart.gridSlate}
                        strokeOpacity={chart.isDark ? 0.85 : 0.35}
                      />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: chart.axisMuted }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={92}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: chart.axis }}
                      />
                      <Tooltip {...tt} formatter={(v: number) => [`${v} leads`, "Volume"]} />
                      <Bar
                        dataKey="value"
                        name="Leads"
                        radius={[0, 10, 10, 0]}
                        barSize={22}
                        fill="url(#adminLeadsTeamBar)"
                        isAnimationActive
                        animationDuration={750}
                      >
                        <LabelList
                          dataKey="value"
                          position="right"
                          fill={chart.labelFill}
                          fontSize={11}
                          fontWeight={600}
                          formatter={(v: number) => (v > 0 ? String(v) : "")}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Table */}
      {(viewMode === "all" || viewMode === "table") && (
        <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border-border">
          <CardHeader className="space-y-4 p-4 pb-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <Table2 className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
                <span className="min-w-0 break-words">Leads table</span>
              </CardTitle>
              <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:max-w-none sm:flex-wrap sm:items-center">
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-300 dark:border-neutral-600 sm:w-[120px]">
                    <SelectValue placeholder="Rows" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={labelFilter || "all"} onValueChange={(v) => (setLabelFilter(v === "all" ? "" : v), setPage(1))}>
                  <SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-300 dark:border-neutral-600 sm:w-[140px]">
                    <SelectValue placeholder="Lead label" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All labels</SelectItem>
                    {LEAD_LABELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={teamFilter || "all"} onValueChange={(v) => (setTeamFilter(v === "all" ? "" : v), setPage(1))}>
                  <SelectTrigger className="h-10 w-full min-w-0 rounded-lg border-neutral-300 dark:border-neutral-600 sm:w-[140px]">
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {teamNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="search"
                  placeholder="Search subject, sender, id…"
                  className="h-10 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-[200px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportTable}
                  className="h-10 w-full gap-2 sm:h-9 sm:w-auto"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  Export data
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <Skeleton className="h-48 w-full rounded-lg sm:h-64" />
            ) : filteredItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">No leads found.</p>
            ) : (
              <>
                <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200/80 dark:divide-neutral-700 dark:border-neutral-700 md:hidden">
                  {filteredItems.map((item) => (
                    <li key={item.id} className="min-w-0 space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/emails/${item.id}`}
                          className="min-w-0 flex-1 text-sm font-medium leading-snug text-neutral-900 hover:underline dark:text-neutral-50"
                        >
                          <span className="line-clamp-2">{item.subject || "(No subject)"}</span>
                        </Link>
                        <span className="shrink-0 font-mono text-[10px] text-neutral-400">{item.id.slice(0, 8)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                        {item.leadLabel && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            {item.leadLabel}
                          </span>
                        )}
                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                          {item.priorityLabel ?? "—"}
                        </span>
                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                          {item.mailType ?? "—"}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 ${
                            item.isRead
                              ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                          }`}
                        >
                          {item.isRead ? "Read" : "Unread"}
                        </span>
                      </div>
                      <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">From:</span>{" "}
                        {item.mailboxOwner ? item.mailboxOwner.split("@")[0] : item.sender ?? "—"}
                      </p>
                      <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {formatDate(item.receivedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="hidden min-w-0 md:block">
                  <LenisScrollArea
                    axis="horizontal"
                    className="rounded-xl border border-neutral-200/80 bg-white/30 [-webkit-overflow-scrolling:touch] dark:border-neutral-700 dark:bg-neutral-800/20"
                  >
                    <table className="min-w-[720px] w-full text-left text-sm">
                      <thead className="border-b border-neutral-200 bg-neutral-50/90 dark:border-neutral-700 dark:bg-neutral-800/50">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            ID
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Lead
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Type
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Created by
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Mail type
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Status
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {filteredItems.map((item) => (
                          <tr key={item.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                            <td className="px-4 py-3 font-mono text-xs text-neutral-500">{item.id.slice(0, 8)}</td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/emails/${item.id}`}
                                className="font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                              >
                                {item.subject || "(No subject)"}
                              </Link>
                              {item.leadLabel && (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                  {item.leadLabel}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{item.priorityLabel ?? "—"}</td>
                            <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                              {item.mailboxOwner ? item.mailboxOwner.split("@")[0] : item.sender ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-700">
                                {item.mailType ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  item.isRead
                                    ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                }`}
                              >
                                {item.isRead ? "Read" : "Unread"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-neutral-500">{formatDate(item.receivedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </LenisScrollArea>
                </div>
                {(totalPages > 1 || total > 0) && (
                  <div className="mt-4 grid grid-cols-1 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:border-t-0 sm:pt-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:order-1 sm:w-auto"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <p className="py-0.5 text-center text-sm text-neutral-500 dark:text-neutral-400 sm:order-2 sm:flex-1 sm:py-0">
                      {total > 0 ? (
                        <>
                          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                          {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
                        </>
                      ) : (
                        `Page ${page} of ${totalPages}`
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:order-3 sm:w-auto"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
        </>
      )}

      {selectedUserEmail && mailKindTab === "retag" && (
        <section className="min-w-0 overflow-hidden rounded-3xl border border-cyan-100 bg-gradient-to-br from-white to-[#edf8ff] p-4 shadow-md shadow-cyan-100/60 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900 dark:shadow-none sm:p-6">
          <CardHeader className="p-0 pb-3 sm:pb-4">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              <Tags className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span className="min-w-0 break-words">
                ReTag — <span className="tabular-nums">{retagTotal}</span>
              </span>
            </CardTitle>
            <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
              {selectedUserEmail} — mail this user retagged from escalation/lead into another department.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <Skeleton className="h-48 w-full rounded-lg sm:h-64" />
            ) : retagItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">No retagged mail.</p>
            ) : (
              <>
                <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200/80 dark:divide-neutral-700 dark:border-neutral-700 md:hidden">
                  {retagItems.map((item) => (
                    <li key={item.id} className="min-w-0 space-y-2 p-3">
                      <Link
                        href={`/emails/${item.id}`}
                        className="block text-sm font-medium leading-snug text-neutral-900 hover:underline dark:text-neutral-50"
                      >
                        <span className="line-clamp-2">{item.subject || "(No subject)"}</span>
                      </Link>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        <span className="font-medium">Department:</span> {item.assignedTeam ?? "—"}
                      </p>
                      <p className="break-words text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        {item.retaggedAt ? formatDate(item.retaggedAt) : "—"}
                        {item.retagPreviousSummary ? (
                          <span className="mt-1 block font-normal">{item.retagPreviousSummary}</span>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="hidden min-w-0 md:block">
                  <LenisScrollArea
                    axis="horizontal"
                    className="rounded-xl border border-neutral-200/80 bg-white/40 [-webkit-overflow-scrolling:touch] dark:border-neutral-700 dark:bg-neutral-800/30"
                  >
                    <table className="min-w-[560px] w-full text-left text-sm">
                      <thead className="border-b border-neutral-200 bg-neutral-50/90 dark:border-neutral-700 dark:bg-neutral-800/50">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3">Subject</th>
                          <th className="whitespace-nowrap px-4 py-3">Department</th>
                          <th className="whitespace-nowrap px-4 py-3">Retagged</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {retagItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <Link
                                href={`/emails/${item.id}`}
                                className="font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                              >
                                {item.subject || "(No subject)"}
                              </Link>
                            </td>
                            <td className="px-4 py-3">{item.assignedTeam ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-neutral-500">
                              {item.retaggedAt ? formatDate(item.retaggedAt) : "—"}
                              {item.retagPreviousSummary ? ` · ${item.retagPreviousSummary}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </LenisScrollArea>
                </div>
              </>
            )}
            {Math.ceil(retagTotal / pageSize) > 1 && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full sm:w-auto"
                  disabled={retagPage <= 1}
                  onClick={() => setRetagPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full sm:w-auto"
                  disabled={retagPage >= Math.ceil(retagTotal / pageSize)}
                  onClick={() => setRetagPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </section>
      )}
    </div>
  );
}
