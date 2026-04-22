"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { ProjectTrackerRow, TrackerDayKey, TrackerEmailListItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function draftDaysForMember(p: ProjectTrackerRow, userId: string): TrackerDayKey[] {
  const m = (p.members ?? []).find((x) => x.userId === userId);
  if (!m) return [];
  const ov = m.scheduleDaysOverride;
  const source = ov != null ? ov : p.scheduleDays;
  return DAY_ORDER.filter((d) => source.includes(d));
}

function orderedDaysFromSet(days: TrackerDayKey[]): TrackerDayKey[] {
  return DAY_ORDER.filter((d) => days.includes(d));
}

type ApiClient = ReturnType<typeof getApi>;

function formatTrackerReceived(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function TrackerSentHistoryMini({
  projectId,
  api,
  refreshToken,
}: {
  projectId: string;
  api: ApiClient;
  refreshToken: number;
}) {
  const [items, setItems] = useState<TrackerEmailListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    api
      .getAdminTrackerProjectEmails(projectId, { days: 30, limit: 10 })
      .then((r) => {
        if (!cancelled) setItems(r.emails ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, projectId, refreshToken]);

  return (
    <div className="mt-4 border-t border-neutral-200/80 pt-4 dark:border-neutral-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Recent tracker sends
        </p>
        <Link
          href={`/admin/tracker/${encodeURIComponent(projectId)}`}
          className="text-xs font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-neutral-300"
        >
          View all
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ) : loadError ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Could not load tracker history.</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">No tracker emails in this window yet.</p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.emailId}>
              <Link
                href={`/emails/${item.emailId}`}
                className="block rounded-md border border-neutral-200/80 bg-neutral-50/60 px-2.5 py-2 text-left transition-colors hover:bg-neutral-100/80 dark:border-neutral-700 dark:bg-neutral-800/40 dark:hover:bg-neutral-800/70"
              >
                <p className="line-clamp-1 text-xs font-medium text-neutral-900 dark:text-neutral-100">
                  {item.subject?.trim() || "(No subject)"}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {formatTrackerReceived(item.receivedAt)} · {item.senderEmail}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Project-level tracker weekdays + optional per-assignee override.
 * Persists via PATCH /api/admin/tracker/{id}; assignees see expectations under Dashboard → Follow-up → Tracker.
 */
function ProjectTrackerAssignCard({
  p,
  busy,
  patchSchedule,
}: {
  p: ProjectTrackerRow;
  busy: boolean;
  patchSchedule: (
    projectId: string,
    scheduleDays: TrackerDayKey[],
    memberScheduleDays?: Record<string, string[] | null>
  ) => Promise<ProjectTrackerRow>;
}) {
  const members = p.members ?? [];
  const [projectDays, setProjectDays] = useState<TrackerDayKey[]>(() =>
    DAY_ORDER.filter((d) => (p.scheduleDays ?? []).includes(d))
  );
  const [userId, setUserId] = useState<string>("");
  const [memberDays, setMemberDays] = useState<TrackerDayKey[]>([]);

  useEffect(() => {
    setProjectDays(DAY_ORDER.filter((d) => (p.scheduleDays ?? []).includes(d)));
  }, [p.projectId, p.scheduleDays]);

  useEffect(() => {
    if (!userId) {
      setMemberDays([]);
      return;
    }
    setMemberDays(draftDaysForMember(p, userId));
  }, [userId, p]);

  const toggleProjectDay = (d: TrackerDayKey) => {
    setProjectDays((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      return orderedDaysFromSet(next);
    });
  };

  const toggleMemberDay = (d: TrackerDayKey) => {
    setMemberDays((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      return orderedDaysFromSet(next);
    });
  };

  const save = async () => {
    const sched = orderedDaysFromSet(projectDays);
    let memberPatch: Record<string, string[] | null> | undefined;
    if (userId) {
      const memberOrdered = orderedDaysFromSet(memberDays);
      const sameAsProject = JSON.stringify(memberOrdered) === JSON.stringify(sched);
      memberPatch = { [userId]: sameAsProject ? null : memberOrdered };
    }
    await patchSchedule(p.projectId, sched, memberPatch);
  };

  return (
    <div className="min-w-0 rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-4 dark:border-neutral-700 dark:bg-neutral-900/30">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="min-w-0 space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Tracker days (project)
            </label>
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap">
              {DAY_ORDER.map((d) => {
                const on = projectDays.includes(d);
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
                    onClick={() => toggleProjectDay(d)}
                  >
                    {SHORT_LABEL[d]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Assignee
            </label>
            {members.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No assignees on this project.</p>
            ) : (
              <Select value={userId || undefined} onValueChange={setUserId} disabled={busy}>
                <SelectTrigger className="h-10 w-full rounded-lg border-neutral-300 dark:border-neutral-600">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      <span className="truncate">{m.displayName || m.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {userId ? (
          <div className="mt-4 space-y-2 border-t border-neutral-200/80 pt-4 dark:border-neutral-700">
            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Expected days for this member
            </label>
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap">
              {DAY_ORDER.map((d) => {
                const on = memberDays.includes(d);
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
                    onClick={() => toggleMemberDay(d)}
                  >
                    {SHORT_LABEL[d]}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <Button type="button" size="sm" className="h-10 w-full sm:h-9 sm:w-auto" disabled={busy} onClick={() => void save()}>
            Save tracker
          </Button>
        </div>
    </div>
  );
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
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const load = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getAdminTracker()
      .then((r) => {
        setRows(
          (r.projects ?? []).map((row) => ({
            ...row,
            members: row.members ?? [],
          }))
        );
        setHistoryRefresh((n) => n + 1);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load tracker");
      })
      .finally(() => setLoading(false));
  }, [api, status]);

  useEffect(() => {
    load();
  }, [load]);

  const patchSchedule = useCallback(
    async (projectId: string, scheduleDays: TrackerDayKey[], memberScheduleDays?: Record<string, string[] | null>) => {
      return api.patchAdminTrackerSchedule(projectId, scheduleDays, undefined, memberScheduleDays);
    },
    [api]
  );

  const handleRowUpdated = useCallback((row: ProjectTrackerRow) => {
    setRows((prev) => prev.map((x) => (x.projectId === row.projectId ? { ...row, members: row.members ?? [] } : x)));
  }, []);

  const runPatch = useCallback(
    async (projectId: string, scheduleDays: TrackerDayKey[], memberScheduleDays?: Record<string, string[] | null>) => {
      setSavingId(projectId);
      try {
        const updated = await patchSchedule(projectId, scheduleDays, memberScheduleDays);
        handleRowUpdated(updated);
        setHistoryRefresh((n) => n + 1);
        return updated;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to save tracker");
        throw err;
      } finally {
        setSavingId(null);
      }
    },
    [patchSchedule, handleRowUpdated]
  );

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Tracker</h1>
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
              Create a project under Admin - Projects and add assignees. Tracker expectations appear for those users
              under Dashboard → Follow-up → Tracker.
            </p>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4">
          {rows.map((p) => (
            <Card key={p.projectId} className="min-w-0 max-w-full overflow-hidden rounded-2xl border-border">
              <CardHeader className="space-y-0 p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="break-words text-base leading-snug sm:text-lg">
                  <Link
                    href={`/admin/tracker/${encodeURIComponent(p.projectId)}`}
                    className="text-left transition-colors hover:text-neutral-600 hover:underline dark:hover:text-neutral-200"
                  >
                    {p.projectName}
                  </Link>
                </CardTitle>
                <p className="mt-1.5 break-words text-sm text-neutral-500 dark:text-neutral-400">{p.teamName ?? "No team"}</p>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ProjectTrackerAssignCard
                  p={{ ...p, members: p.members ?? [] }}
                  busy={savingId === p.projectId}
                  patchSchedule={runPatch}
                />
                <TrackerSentHistoryMini projectId={p.projectId} api={api} refreshToken={historyRefresh} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
