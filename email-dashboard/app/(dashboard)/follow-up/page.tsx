"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type {
  FollowUpTrackerDay,
  FollowUpTrackerHistoryEmail,
  FollowUpTrackerProject,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const SHORT: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** ISO weekday 1=Mon … 7=Sun — matches admin tracker “send before” rule. */
const DOW_ISO: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

function formatWeek(startISO: string, endISO: string) {
  try {
    const a = new Date(startISO);
    const b = new Date(endISO);
    const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    return `${a.toLocaleDateString(undefined, o)} – ${b.toLocaleDateString(undefined, o)} (UTC week)`;
  } catch {
    return startISO;
  }
}

function formatReceived(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function ProjectTrackerCard({
  p,
  api,
}: {
  p: FollowUpTrackerProject;
  api: ReturnType<typeof getApi>;
}) {
  const [open, setOpen] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [hist, setHist] = useState<FollowUpTrackerHistoryEmail[]>([]);
  const [histErr, setHistErr] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    setHistLoading(true);
    setHistErr(null);
    api
      .getFollowUpTrackerHistory(p.projectId, 90)
      .then((r) => setHist(r.emails ?? []))
      .catch(() => {
        setHistErr("Could not load history");
        setHist([]);
      })
      .finally(() => setHistLoading(false));
  }, [api, p.projectId]);

  useEffect(() => {
    if (!open) return;
    loadHistory();
  }, [open, loadHistory]);

  const personalDeadlineIso = useMemo(() => {
    const k = p.memberDeadlineBefore?.toLowerCase();
    if (!k || DOW_ISO[k] == null) return null;
    return DOW_ISO[k];
  }, [p.memberDeadlineBefore]);

  const metPersonalDeadline = useMemo(() => {
    if (personalDeadlineIso == null) return true;
    return p.days.some((d) => {
      const di = DOW_ISO[d.key] ?? 0;
      return di < personalDeadlineIso && d.sentByMe;
    });
  }, [p.days, personalDeadlineIso]);

  return (
    <Card className="min-w-0 max-w-full rounded-2xl border-border">
      <CardHeader className="space-y-1 p-4 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="break-words text-base sm:text-lg">{p.projectName}</CardTitle>
        <p className="break-words text-sm text-neutral-500 dark:text-neutral-400">{p.teamName ?? "No team"}</p>
        <p className="break-words text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
          {formatWeek(p.weekStartISO, p.weekEndISO)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {p.days.some((d) => d.expected) || p.memberDeadlineBefore ? (
          <div className="min-w-0 rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5 dark:bg-neutral-900/35">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Tracker settings
            </p>
            <dl className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-200">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                <dt className="shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">Expected days</dt>
                <dd className="min-w-0 break-words">
                  {(p.effectiveScheduleDays ?? []).length > 0
                    ? (p.effectiveScheduleDays ?? []).map((d) => SHORT[d] ?? d).join(", ")
                    : "—"}
                </dd>
              </div>
              {p.memberDeadlineBefore ? (
                <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                  <dt className="shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Your send-by
                  </dt>
                  <dd className="min-w-0">
                    Before {SHORT[p.memberDeadlineBefore] ?? p.memberDeadlineBefore} (UTC week)
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            This week — you sent?
          </p>
          <div className="max-w-full overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:overflow-visible sm:pb-0">
            <div className="grid min-w-[18rem] grid-cols-7 gap-0.5 text-center text-[10px] sm:min-w-0 sm:gap-1 sm:text-xs">
              {p.days.map((day: FollowUpTrackerDay) => {
                const dIso = DOW_ISO[day.key] ?? 0;
                const inPersonalSendWindow =
                  personalDeadlineIso != null && dIso < personalDeadlineIso;
                const personalDue = inPersonalSendWindow && !metPersonalDeadline;
                const scheduleDue = day.expected && !day.sentByMe;
                const showDue = scheduleDue || personalDue;
                return (
                  <div
                    key={day.key}
                    className="flex min-w-0 flex-col items-center gap-0.5 rounded-md border border-neutral-200 bg-neutral-50/80 px-0.5 py-1.5 sm:gap-1 sm:py-2 dark:border-neutral-700 dark:bg-neutral-900/40"
                  >
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">
                      {SHORT[day.key] ?? day.key}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold sm:h-6 sm:w-6 sm:text-[10px]",
                        day.sentByMe
                          ? "bg-emerald-500 text-white"
                          : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                      )}
                      title={day.label}
                    >
                      {day.sentByMe ? "✓" : "—"}
                    </span>
                    {showDue && (
                      <span className="text-[8px] leading-tight text-amber-700 dark:text-amber-400 sm:text-[9px]">
                        due
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div data-tour-id="followup-history" className="min-w-0">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-panel/60 px-3 py-2.5 text-left text-sm font-medium text-neutral-800 dark:text-neutral-100"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="min-w-0 flex-1 break-words pr-1 leading-snug">
              Your tracker send history (last 90 days)
            </span>
            {open ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </button>
          {open && (
            <div className="mt-2 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              {histLoading ? (
                <>
                  <Skeleton className="h-12 w-full rounded-md" />
                  <Skeleton className="h-12 w-full rounded-md" />
                </>
              ) : histErr ? (
                <p className="break-words text-sm text-red-600 dark:text-red-400">{histErr}</p>
              ) : hist.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No matching sends found.</p>
              ) : (
                <ul className="space-y-2">
                  {hist.map((e) => (
                    <li key={e.emailId} className="min-w-0">
                      <Link
                        href={`/emails/${e.emailId}`}
                        className="block min-w-0 rounded-md border border-border bg-panel px-3 py-2.5 text-sm transition-colors hover:bg-panel-elevated/80"
                      >
                        <span className="line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">
                          {e.subject?.trim() || "(No subject)"}
                        </span>
                        <span className="mt-1 block break-words text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                          {formatReceived(e.receivedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FollowUpPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<FollowUpTrackerProject[]>([]);
  const [weekHint, setWeekHint] = useState("");

  const load = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getFollowUpTracker()
      .then((r) => {
        setProjects(
          (r.projects ?? []).map((proj) => ({
            ...proj,
            scheduleDays: proj.scheduleDays ?? [],
            effectiveScheduleDays:
              proj.effectiveScheduleDays ??
              (proj.days ?? []).filter((d) => d.expected).map((d) => d.key),
            memberDeadlineBefore: proj.memberDeadlineBefore ?? null,
          }))
        );
        setWeekHint(formatWeek(r.weekStartISO, r.weekEndISO));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [api, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div
        data-tour-id="followup-header"
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4"
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
            Follow UP
          </h1>
          {weekHint && (
            <p className="mt-1 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:mt-2">
              {weekHint}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full shrink-0 sm:h-9 sm:w-auto"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4 shrink-0", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span className="break-words">{error}</span>
        </p>
      )}

      {loading ? (
        <div data-tour-id="followup-projects" className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl sm:h-48" />
          <Skeleton className="h-40 w-full rounded-xl sm:h-48" />
        </div>
      ) : projects.length === 0 ? (
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">No assigned projects</CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              When you are assigned to a team project, tracker follow-up appears here.
            </p>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <ProjectTrackerCard key={p.projectId} p={p} api={api} />
          ))}
        </div>
      )}
    </div>
  );
}
