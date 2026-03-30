"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { ProjectTrackerRow, TrackerDayKey } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const DAY_ORDER: TrackerDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SHORT_LABEL: Record<TrackerDayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function formatWeekRange(startISO: string, endISO: string): string {
  try {
    const a = new Date(startISO);
    const b = new Date(endISO);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, opts)} (UTC week)`;
  } catch {
    return startISO;
  }
}

export default function AdminTrackerPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [rows, setRows] = useState<ProjectTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getAdminTracker()
      .then((r) => setRows(r.projects ?? []))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load tracker");
      })
      .finally(() => setLoading(false));
  }, [api, status]);

  useEffect(() => {
    load();
  }, [load]);

  const weekHint = rows[0] ? formatWeekRange(rows[0].weekStartISO, rows[0].weekEndISO) : null;

  const toggleExpectedDay = (projectId: string, day: TrackerDayKey, current: string[]) => {
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    setSavingId(projectId);
    api
      .patchAdminTrackerSchedule(projectId, next)
      .then((updated) => {
        setRows((prev) => prev.map((p) => (p.projectId === projectId ? updated : p)));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to save schedule");
      })
      .finally(() => setSavingId(null));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Tracker</h1>
          {weekHint && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">Showing week: {weekHint}</p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects</CardTitle>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Create a project under Admin - Projects to configure tracker days.
            </p>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((p) => (
            <Card key={p.projectId} className="overflow-hidden">
              <CardHeader className="pb-2">
                <Link
                  href={`/admin/tracker/${encodeURIComponent(p.projectId)}`}
                  className="group block w-full text-left transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <CardTitle className="text-lg group-hover:underline">{p.projectName}</CardTitle>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    {p.teamName ?? "No team"}
                    <span className="ml-2 text-xs font-normal text-neutral-400 dark:text-neutral-500">
                      · Open history
                    </span>
                  </p>
                </Link>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Expected tracker days (click to toggle)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_ORDER.map((d) => {
                      const on = p.scheduleDays.includes(d);
                      const busy = savingId === p.projectId;
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          className={cn("min-w-[3rem] px-2", on && "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900")}
                          disabled={busy}
                          onClick={() => toggleExpectedDay(p.projectId, d, p.scheduleDays)}
                        >
                          {SHORT_LABEL[d]}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    This week — sent?
                  </p>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] sm:text-xs">
                    {p.days.map((day) => (
                      <div key={day.key} className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50/80 px-0.5 py-2 dark:border-neutral-700 dark:bg-neutral-900/40">
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">{SHORT_LABEL[day.key]}</span>
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                            day.sent
                              ? "bg-emerald-500 text-white"
                              : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                          )}
                          title={day.label}
                        >
                          {day.sent ? "✓" : "—"}
                        </span>
                        {day.expected && !day.sent && (
                          <span className="text-[9px] leading-tight text-amber-700 dark:text-amber-400">due</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}
