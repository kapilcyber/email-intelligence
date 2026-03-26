"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { ReviewEscalationUser, ReviewProjectTrackerUser } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, AlertCircle, CalendarRange } from "lucide-react";
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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          <ClipboardCheck className="h-7 w-7 shrink-0 opacity-80" />
          Review
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Review team performance using parameters. You can add more parameters in this section later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PARAMS.map((p) => {
              const Icon = p.icon;
              return (
                <Button
                  key={p.id}
                  type="button"
                  variant={active === p.id ? "default" : "outline"}
                  onClick={() => setActive(p.id)}
                  className={cn(active === p.id && "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900")}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {p.label}
                </Button>
              );
            })}
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{activeMeta.description}</p>
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((d) => (
              <Button key={d} type="button" size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d as 7 | 30 | 90)}>
                Last {d} days
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {active === "escalation" ? "Escalation review (user-wise)" : "Project tracker review (user-wise)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : active === "escalation" ? (
            escalationRows.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      <th className="px-2 py-2">User</th>
                      <th className="px-2 py-2">Escalations</th>
                      <th className="px-2 py-2">Replied</th>
                      <th className="px-2 py-2">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escalationRows.map((r) => (
                      <tr key={r.email} className="border-b border-neutral-100 dark:border-neutral-800">
                        <td className="px-2 py-2">
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">{r.displayName || r.email}</div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</div>
                        </td>
                        <td className="px-2 py-2 tabular-nums">{r.escalationCount}</td>
                        <td className="px-2 py-2 tabular-nums">{r.repliedCount}</td>
                        <td className="px-2 py-2 tabular-nums">{r.pendingCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : trackerRows.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                    <th className="px-2 py-2">User</th>
                    <th className="px-2 py-2">Tracker count</th>
                    <th className="px-2 py-2">Sent?</th>
                  </tr>
                </thead>
                <tbody>
                  {trackerRows.map((r) => (
                    <tr key={r.email} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="px-2 py-2">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{r.displayName || r.email}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</div>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{r.trackerCount}</td>
                      <td className="px-2 py-2">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
