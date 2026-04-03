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
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Queue Monitor</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Your mailbox backlog (not the whole deployment)
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-2xl">
              <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Queue Monitor</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Redis & Celery workers
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Your pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{data.pending}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Enqueued for your mailbox</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Your active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{data.active}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Running now (best-effort)</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {data.activeWorkers ?? "—"}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Shared pool</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{data.failed}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Retry count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{data.retryCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Worker uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {formatUptime(data.workerUptime)}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.taskDistribution && data.taskDistribution.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Task distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.taskDistribution} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: chart.axis }} />
                  <YAxis tick={{ fontSize: 12, fill: chart.axisMuted }} />
                  <Tooltip {...tt} contentStyle={{ ...tt.contentStyle, borderRadius: "0.5rem" }} />
                  <Bar dataKey="count" fill={chart.isDark ? "#a1a1aa" : "#64748b"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
