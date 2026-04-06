"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { ReviewEscalationUser, ReviewProjectTrackerUser } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CalendarRange } from "lucide-react";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";

type ReviewParam = "escalation" | "projectTracker";

const PARAMS: Array<{ id: ReviewParam; label: string; icon: typeof AlertCircle; description: string }> = [
  {
    id: "escalation",
    label: "Escalation",
    icon: AlertCircle,
    description: "User-wise escalation count and whether replies were sent.",
  },
  {
    id: "projectTracker",
    label: "Project tracker",
    icon: CalendarRange,
    description: "User-wise tracker send count (subject contains tracker + project name).",
  },
];

export default function AdminReviewPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [active, setActive] = useState<ReviewParam>("escalation");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [escalationRows, setEscalationRows] = useState<ReviewEscalationUser[]>([]);
  const [trackerRows, setTrackerRows] = useState<ReviewProjectTrackerUser[]>([]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    const req =
      active === "escalation"
        ? api.getAdminReviewEscalationReplies(days).then((r) => setEscalationRows(r ?? []))
        : api.getAdminReviewProjectTracker(days).then((r) => setTrackerRows(r ?? []));
    req
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load review metrics"))
      .finally(() => setLoading(false));
  }, [api, status, active, days]);

  const activeMeta = PARAMS.find((p) => p.id === active) ?? PARAMS[0];

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Review</h1>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
          Admin metrics by user: escalation replies or project tracker sends.
        </p>
      </div>

      <Card className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">Parameters</CardTitle>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{activeMeta.description}</p>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {PARAMS.map((p) => {
              const Icon = p.icon;
              return (
                <Button
                  key={p.id}
                  type="button"
                  variant={active === p.id ? "default" : "outline"}
                  onClick={() => setActive(p.id)}
                  className={cn(
                    "h-10 w-full justify-center sm:h-9 sm:w-auto sm:justify-start",
                    active === p.id && "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
                  )}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  {p.label}
                </Button>
              );
            })}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Date range</p>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {[7, 30, 90].map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={days === d ? "default" : "outline"}
                  className="h-10 w-full sm:h-8 sm:w-auto"
                  onClick={() => setDays(d as 7 | 30 | 90)}
                >
                  Last {d} days
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span className="break-words">{error}</span>
        </p>
      )}

      <Card className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base leading-snug">
            {active === "escalation" ? "Escalation review (user-wise)" : "Project tracker review (user-wise)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-md sm:h-10" />
              <Skeleton className="h-12 w-full rounded-md sm:h-10" />
              <Skeleton className="h-12 w-full rounded-md sm:h-10" />
            </div>
          ) : active === "escalation" ? (
            escalationRows.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No data.</p>
            ) : (
              <>
                <ul className="divide-y divide-neutral-200 rounded-lg border border-border dark:divide-neutral-700 md:hidden">
                  {escalationRows.map((r) => (
                    <li key={r.email} className="space-y-3 p-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-neutral-900 dark:text-neutral-100">
                          {r.displayName || r.email}
                        </p>
                        <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">{r.email}</p>
                      </div>
                      <dl className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            Esc.
                          </dt>
                          <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {r.escalationCount}
                          </dd>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            Replied
                          </dt>
                          <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {r.repliedCount}
                          </dd>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            Pending
                          </dt>
                          <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {r.pendingCount}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="hidden min-w-0 md:block">
                  <LenisScrollArea
                    axis="horizontal"
                    className="rounded-lg border border-border [-webkit-overflow-scrolling:touch]"
                  >
                    <table className="min-w-[520px] w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                          <th className="whitespace-nowrap px-3 py-2.5">User</th>
                          <th className="whitespace-nowrap px-3 py-2.5">Escalations</th>
                          <th className="whitespace-nowrap px-3 py-2.5">Replied</th>
                          <th className="whitespace-nowrap px-3 py-2.5">Pending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {escalationRows.map((r) => (
                          <tr key={r.email} className="border-b border-neutral-100 dark:border-neutral-800">
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                {r.displayName || r.email}
                              </div>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</div>
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">{r.escalationCount}</td>
                            <td className="px-3 py-2.5 tabular-nums">{r.repliedCount}</td>
                            <td className="px-3 py-2.5 tabular-nums">{r.pendingCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </LenisScrollArea>
                </div>
              </>
            )
          ) : trackerRows.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No data.</p>
          ) : (
            <>
              <ul className="divide-y divide-neutral-200 rounded-lg border border-border dark:divide-neutral-700 md:hidden">
                {trackerRows.map((r) => (
                  <li key={r.email} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-neutral-900 dark:text-neutral-100">
                        {r.displayName || r.email}
                      </p>
                      <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">{r.email}</p>
                      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                        Tracker sends: <span className="tabular-nums font-semibold">{r.trackerCount}</span>
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex w-fit self-start rounded-full px-2.5 py-1 text-xs font-medium sm:self-center",
                        r.hasSentTracker
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      )}
                    >
                      {r.hasSentTracker ? "Sent" : "Not sent"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="hidden min-w-0 md:block">
                <LenisScrollArea
                  axis="horizontal"
                  className="rounded-lg border border-border [-webkit-overflow-scrolling:touch]"
                >
                  <table className="min-w-[420px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                        <th className="whitespace-nowrap px-3 py-2.5">User</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Tracker count</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Sent?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trackerRows.map((r) => (
                        <tr key={r.email} className="border-b border-neutral-100 dark:border-neutral-800">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">
                              {r.displayName || r.email}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</div>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">{r.trackerCount}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                r.hasSentTracker
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                              )}
                            >
                              {r.hasSentTracker ? "Yes" : "No"}
                            </span>
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
      </Card>
    </div>
  );
}
