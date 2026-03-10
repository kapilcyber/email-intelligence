"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem, TeamOut, UserLeadCountOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Info, Table2, Users } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const PAGE_SIZE = 20;
const CHART_PAGE_SIZE = 200;
const LEAD_LABELS = ["Hot", "Warm", "Cold"];
const CHART_COLORS = ["#ef4444", "#f97316", "#22c55e", "#0ea5e9", "#8b5cf6", "#94a3b8"];

type ViewMode = "all" | "analytics" | "table";
type DateRange = "month" | "year" | "custom";

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
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("");

  const [teams, setTeams] = useState<TeamOut[]>([]);
  const [userCounts, setUserCounts] = useState<UserLeadCountOut[]>([]);
  const [userCountsLoading, setUserCountsLoading] = useState(true);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [items, setItems] = useState<EscalationLeadItem[]>([]);
  const [chartItems, setChartItems] = useState<EscalationLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromDate = dateRange === "custom" ? customFrom : getDateRangeFromPreset(dateRange);

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
        pageSize: PAGE_SIZE,
        label: labelFilter || undefined,
        team: teamFilter || undefined,
        from: fromDate || undefined,
      })
      .then((r) => {
        setItems(r.leads);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load leads"))
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
    if (selectedUserEmail) loadTable();
  }, [status, api, selectedUserEmail, page, labelFilter, teamFilter, fromDate]);

  useEffect(() => {
    if (selectedUserEmail && (viewMode === "all" || viewMode === "analytics")) {
      loadCharts();
    }
  }, [status, api, selectedUserEmail, viewMode, labelFilter, teamFilter, fromDate]);

  useEffect(() => {
    if (status !== "authenticated" || !selectedUserEmail) return;
    const id = window.setInterval(() => {
      loadTable();
      if (viewMode === "all" || viewMode === "analytics") loadCharts();
    }, 30000);
    return () => window.clearInterval(id);
  }, [status, api, selectedUserEmail, page, labelFilter, fromDate, viewMode]);

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

  const donutData = useMemo(() => {
    const byLabel: Record<string, number> = {};
    LEAD_LABELS.forEach((l) => (byLabel[l] = 0));
    chartItems.forEach((i) => {
      const l = i.leadLabel || "Other";
      byLabel[l] = (byLabel[l] ?? 0) + 1;
    });
    return Object.entries(byLabel).map(([name, value]) => ({ name, value }));
  }, [chartItems]);

  const barData = useMemo(() => {
    const byTeam: Record<string, number> = {};
    chartItems.forEach((i) => {
      const t = i.assignedTeam || "Unassigned";
      byTeam[t] = (byTeam[t] ?? 0) + 1;
    });
    return Object.entries(byTeam).map(([team, count]) => ({ team, count }));
  }, [chartItems]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleDownload = () => {
    const rows = [
      ["ID", "Subject", "Lead", "Created by", "Mail type", "Priority", "Date"],
      ...items.map((i) => [
        i.id,
        i.subject ?? "",
        i.leadLabel ?? "",
        i.mailboxOwner ?? i.sender ?? "",
        i.mailType ?? "—",
        i.priorityLabel ?? "",
        formatDate(i.receivedAt),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTable = () => {
    const rows = [
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
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-table-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Leads</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {selectedUserEmail
              ? `Lead mails for ${selectedUser?.displayName ?? selectedUserEmail.split("@")[0]}`
              : "All users. Click a user to see their lead mails (Hot / Warm / Cold)."}
          </p>
        </div>
        {selectedUserEmail && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => (setSelectedUserEmail(null), setPage(1))} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to users
            </Button>
            <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
              {(["all", "analytics", "table"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                    viewMode === mode
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  {mode === "all" ? "All" : mode === "analytics" ? "Analytics only" : "Table only"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="year">This year</SelectItem>
                  <SelectItem value="custom">Custom date</SelectItem>
                </SelectContent>
              </Select>
              {dateRange === "custom" && (
                <input
                  type="date"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  value={customFrom}
                  onChange={(e) => (setCustomFrom(e.target.value), setPage(1))}
                />
              )}
            </div>
            <Button variant="default" size="sm" onClick={handleDownload} className="gap-2">
              <Download className="h-4 w-4" />
              Download data
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* User list: show first; click user to see their leads table */}
      {!selectedUserEmail && (
        <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5" />
              Users — lead count
            </CardTitle>
            <p className="text-sm font-normal text-neutral-500 dark:text-neutral-400">
              Click a user to open their lead mails table.
            </p>
          </CardHeader>
          <CardContent>
            {userCountsLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : userCounts.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">No users found.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">User</th>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Email</th>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Lead count</th>
                      <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                    {userCounts.map((u) => (
                      <tr
                        key={u.email}
                        className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                        onClick={() => setSelectedUserEmail(u.email)}
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedUserEmail && (
        <>
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total leads</p>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{total}</p>
              </div>
              <Info className="h-5 w-5 text-neutral-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">By label</p>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {donutData.filter((d) => d.value > 0).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Teams</p>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{barData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Date range</p>
                <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  {fromDate ? formatDate(fromDate) : "All"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {(viewMode === "all" || viewMode === "analytics") && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
              <CardHeader>
                <CardTitle className="text-base">Leads over time</CardTitle>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <Skeleton className="h-[240px] w-full rounded-lg" />
                ) : lineData.length === 0 ? (
                  <p className="flex h-[240px] items-center justify-center text-sm text-neutral-500">
                    No data for selected range
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={lineData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} name="Count" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
              <CardHeader>
                <CardTitle className="text-base">By lead label</CardTitle>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <Skeleton className="h-[240px] w-full rounded-lg" />
                ) : donutData.length === 0 ? (
                  <p className="flex h-[240px] items-center justify-center text-sm text-neutral-500">
                    No data for selected range
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle className="text-base">By assigned team</CardTitle>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <Skeleton className="h-[240px] w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                    <XAxis dataKey="team" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0ea5e9" name="Count" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      {(viewMode === "all" || viewMode === "table") && (
        <Card className="rounded-xl border-neutral-200 dark:border-neutral-800">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Table2 className="h-5 w-5" />
                Leads table
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={labelFilter || "all"} onValueChange={(v) => (setLabelFilter(v === "all" ? "" : v), setPage(1))}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Lead label" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All labels</SelectItem>
                    {LEAD_LABELS.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={teamFilter || "all"} onValueChange={(v) => (setTeamFilter(v === "all" ? "" : v), setPage(1))}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {teamNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="search"
                  placeholder="Search"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={handleExportTable} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export data
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : filteredItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">No leads found.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">ID</th>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Lead</th>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Type</th>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Created by</th>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Mail type</th>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Status</th>
                        <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Date</th>
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
                </div>
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  );
}
