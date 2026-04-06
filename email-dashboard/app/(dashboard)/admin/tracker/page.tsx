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
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Tracker</h1>
          {weekHint && (
            <p className="mt-1 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:mt-2">
              Showing week: {weekHint}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
            Set expected send days per project; green checkmarks show sends this week.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full shrink-0 sm:h-9 sm:w-auto"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4 shrink-0", loading && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span className="break-words">{error}</span>
        </p>
      )}

      {loading ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl sm:h-48" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">No projects</CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              Create a project under Admin - Projects to configure tracker days.
            </p>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
          {rows.map((p) => (
            <Card key={p.projectId} className="min-w-0 max-w-full overflow-hidden rounded-2xl border-border">
              <CardHeader className="space-y-0 p-4 pb-2 sm:p-6 sm:pb-2">
                <Link
                  href={`/admin/tracker/${encodeURIComponent(p.projectId)}`}
                  className="group block w-full min-w-0 text-left transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <CardTitle className="break-words text-base leading-snug group-hover:underline sm:text-lg">
                    {p.projectName}
                  </CardTitle>
                  <p className="mt-1.5 break-words text-sm text-neutral-500 dark:text-neutral-400">
                    {p.teamName ?? "No team"}
                    <span className="mt-0.5 block text-xs font-normal text-neutral-400 dark:text-neutral-500 sm:ml-2 sm:mt-0 sm:inline">
                      · Open history
                    </span>
                  </p>
                </Link>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Tracker days
                  </p>
                  <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap">
                    {DAY_ORDER.map((d) => {
                      const on = p.scheduleDays.includes(d);
                      const busy = savingId === p.projectId;
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          className={cn(
                            "h-9 min-h-9 w-full min-w-0 px-1 text-xs sm:min-w-[3rem] sm:w-auto sm:px-2",
                            on && "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
                          )}
                          disabled={busy}
                          onClick={() => toggleExpectedDay(p.projectId, d, p.scheduleDays)}
                        >
                          {SHORT_LABEL[d]}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    This week — sent?
                  </p>
                  <div className="max-w-full overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:overflow-visible sm:pb-0">
                    <div className="grid min-w-[18rem] grid-cols-7 gap-0.5 text-center text-[10px] sm:min-w-0 sm:gap-1 sm:text-xs">
                      {p.days.map((day) => (
                        <div
                          key={day.key}
                          className="flex min-w-0 flex-col items-center gap-0.5 rounded-md border border-neutral-200 bg-neutral-50/80 px-0.5 py-1.5 sm:gap-1 sm:py-2 dark:border-neutral-700 dark:bg-neutral-900/40"
                        >
                          <span className="font-medium text-neutral-600 dark:text-neutral-300">
                            {SHORT_LABEL[day.key]}
                          </span>
                          <span
                            className={cn(
                              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold sm:h-6 sm:w-6 sm:text-[10px]",
                              day.sent
                                ? "bg-emerald-500 text-white"
                                : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                            )}
                            title={day.label}
                          >
                            {day.sent ? "✓" : "—"}
                          </span>
                          {day.expected && !day.sent && (
                            <span className="text-[8px] leading-tight text-amber-700 dark:text-amber-400 sm:text-[9px]">
                              due
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
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
