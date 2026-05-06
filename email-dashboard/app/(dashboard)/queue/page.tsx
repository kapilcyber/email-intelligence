"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api/client";
import type { QueueStatusResponse } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { chartTooltipProps, useChartTheme } from "@/lib/use-chart-theme";

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export default function QueueMonitorPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [data, setData] = useState<QueueStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chart = useChartTheme();
  const tt = chartTooltipProps(chart);

  useEffect(() => {
    if (status !== "authenticated") return;
    api
      .getQueueStatus()
      .then(setData)
      .catch(() => setError("Failed to load queue status"))
      .finally(() => setLoading(false));
  }, [status, api]);

  if (error) {
    return (
      <div className="min-w-0 max-w-full rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
        <p className="break-words">{error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
            Queue Monitor
          </h1>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
            Your mailbox backlog (not the whole deployment)
          </p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="min-w-0 rounded-2xl border-border">
              <CardHeader className="p-4 sm:p-6">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          Queue Monitor
        </h1>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
          “Pending” is a Redis counter for ingest + classify + backfill jobs. For classification only, use “AI pending
          (DB)”.
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Your pending
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{data.pending}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Tracked tasks for your mailbox</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              AI pending (DB)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
              {data.mailboxAiPending ?? "—"}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Emails awaiting classification (authoritative)
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Your active
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{data.active}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Running now (best-effort)</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Workers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
              {data.activeWorkers ?? "—"}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Shared pool</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{data.failed}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Retry count
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{data.retryCount}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Worker uptime
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
              {formatUptime(data.workerUptime)}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.taskDistribution && data.taskDistribution.length > 0 && (
        <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base">Task distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]">
              <div className="h-56 min-h-[14rem] w-full min-w-[280px] sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.taskDistribution} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: chart.axis }} />
                  <YAxis tick={{ fontSize: 12, fill: chart.axisMuted }} />
                  <Tooltip {...tt} contentStyle={{ ...tt.contentStyle, borderRadius: "0.5rem" }} />
                  <Bar dataKey="count" fill={chart.isDark ? "#a1a1aa" : "#64748b"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
