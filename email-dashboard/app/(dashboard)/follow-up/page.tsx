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
import { BellRing, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{p.projectName}</CardTitle>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{p.teamName ?? "No team"}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{formatWeek(p.weekStartISO, p.weekEndISO)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Expected days (set by admin)
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {p.scheduleDays.length > 0 ? p.scheduleDays.map((d) => SHORT[d] ?? d).join(", ") : "None configured"}
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            This week — you sent?
          </p>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] sm:text-xs">
            {p.days.map((day: FollowUpTrackerDay) => (
              <div
                key={day.key}
                className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50/80 px-0.5 py-2 dark:border-neutral-700 dark:bg-neutral-900/40"
              >
                <span className="font-medium text-neutral-600 dark:text-neutral-300">{SHORT[day.key] ?? day.key}</span>
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                    day.sentByMe
                      ? "bg-emerald-500 text-white"
                      : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                  )}
                  title={day.label}
                >
                  {day.sentByMe ? "✓" : "—"}
                </span>
                {day.expected && !day.sentByMe && (
                  <span className="text-[9px] leading-tight text-amber-700 dark:text-amber-400">due</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div data-tour-id="followup-history">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-100"
            onClick={() => setOpen((o) => !o)}
          >
            Your tracker send history (last 90 days)
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {open && (
            <div className="mt-2 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              {histLoading ? (
                <>
                  <Skeleton className="h-12 w-full rounded-md" />
                  <Skeleton className="h-12 w-full rounded-md" />
                </>
              ) : histErr ? (
                <p className="text-sm text-red-600 dark:text-red-400">{histErr}</p>
              ) : hist.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No matching sends found.</p>
              ) : (
                <ul className="space-y-2">
                  {hist.map((e) => (
                    <li key={e.emailId}>
                      <Link
                        href={`/emails/${e.emailId}`}
                        className="block rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                      >
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {e.subject?.trim() || "(No subject)"}
                        </span>
                        <span className="mt-1 block text-xs text-neutral-500">{formatReceived(e.receivedAt)}</span>
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
        setProjects(r.projects ?? []);
        setWeekHint(formatWeek(r.weekStartISO, r.weekEndISO));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [api, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div data-tour-id="followup-header" className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            <BellRing className="h-7 w-7 shrink-0 opacity-80" aria-hidden />
            Follow UP
          </h1>
          {weekHint && <p className="mt-2 text-xs text-neutral-500">{weekHint}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <div data-tour-id="followup-projects" className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No assigned projects</CardTitle>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
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
