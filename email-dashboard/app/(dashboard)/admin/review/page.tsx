"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { ReviewEscalationUser, ReviewLeadUser, ReviewProjectTrackerUser } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";

type MergedReviewRow = {
  email: string;
  displayName: string | null;
  escalationCount: number;
  escalationReplied: number;
  escalationPending: number;
  leadCount: number;
  leadReplied: number;
  leadPending: number;
  trackersSetCount: number;
  trackerCount: number;
  hasSentTracker: boolean;
};

function mergeAdminReviewRows(
  esc: ReviewEscalationUser[],
  leads: ReviewLeadUser[],
  tracker: ReviewProjectTrackerUser[]
): MergedReviewRow[] {
  const map = new Map<string, MergedReviewRow>();

  const ensure = (email: string, displayName: string | null | undefined) => {
    const k = email.trim().toLowerCase();
    let r = map.get(k);
    if (!r) {
      r = {
        email,
        displayName: displayName ?? null,
        escalationCount: 0,
        escalationReplied: 0,
        escalationPending: 0,
        leadCount: 0,
        leadReplied: 0,
        leadPending: 0,
        trackersSetCount: 0,
        trackerCount: 0,
        hasSentTracker: false,
      };
      map.set(k, r);
    } else if (displayName && !r.displayName) {
      r.displayName = displayName;
    }
    return r;
  };

  for (const e of esc) {
    const r = ensure(e.email, e.displayName);
    r.escalationCount = e.escalationCount;
    r.escalationReplied = e.repliedCount;
    r.escalationPending = e.pendingCount;
  }
  for (const l of leads) {
    const r = ensure(l.email, l.displayName);
    r.leadCount = l.leadCount;
    r.leadReplied = l.repliedCount;
    r.leadPending = l.pendingCount;
  }
  for (const t of tracker) {
    const r = ensure(t.email, t.displayName);
    r.trackersSetCount = t.trackersSetCount ?? 0;
    r.trackerCount = t.trackerCount;
    r.hasSentTracker = t.hasSentTracker;
  }

  return [...map.values()].sort((a, b) => {
    const pa = a.escalationPending + a.leadPending;
    const pb = b.escalationPending + b.leadPending;
    if (pb !== pa) return pb - pa;
    const ta = a.escalationCount + a.leadCount;
    const tb = b.escalationCount + b.leadCount;
    if (tb !== ta) return tb - ta;
    return a.email.localeCompare(b.email);
  });
}

const REVIEW_LOOKBACK_DAYS = 30;

export default function AdminReviewPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [escalationRows, setEscalationRows] = useState<ReviewEscalationUser[]>([]);
  const [leadRows, setLeadRows] = useState<ReviewLeadUser[]>([]);
  const [trackerRows, setTrackerRows] = useState<ReviewProjectTrackerUser[]>([]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getAdminReviewEscalationReplies(REVIEW_LOOKBACK_DAYS),
      api.getAdminReviewLeadReplies(REVIEW_LOOKBACK_DAYS),
      api.getAdminReviewProjectTracker(REVIEW_LOOKBACK_DAYS),
    ])
      .then(([esc, lead, tr]) => {
        setEscalationRows(esc ?? []);
        setLeadRows(lead ?? []);
        setTrackerRows(tr ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load review metrics"))
      .finally(() => setLoading(false));
  }, [api, status]);

  const mergedRows = useMemo(
    () => mergeAdminReviewRows(escalationRows, leadRows, trackerRows),
    [escalationRows, leadRows, trackerRows]
  );

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Review</h1>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span className="break-words">{error}</span>
        </p>
      )}

      <Card className="min-w-0 rounded-2xl border-border">
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-md sm:h-10" />
              <Skeleton className="h-12 w-full rounded-md sm:h-10" />
              <Skeleton className="h-12 w-full rounded-md sm:h-10" />
            </div>
          ) : mergedRows.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No data.</p>
          ) : (
            <>
              <ul className="divide-y divide-neutral-200 rounded-lg border border-border dark:divide-neutral-700 md:hidden">
                {mergedRows.map((r) => (
                  <li key={r.email} className="space-y-3 p-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-neutral-900 dark:text-neutral-100">
                        {r.displayName || r.email}
                      </p>
                      <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">{r.email}</p>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Escalations
                    </p>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/40 px-2 py-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Total
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
                          {r.escalationReplied}
                        </dd>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2 py-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Pending
                        </dt>
                        <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {r.escalationPending}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Leads
                    </p>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/40 px-2 py-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Total
                        </dt>
                        <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {r.leadCount}
                        </dd>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2 py-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Replied
                        </dt>
                        <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {r.leadReplied}
                        </dd>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2 py-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Pending
                        </dt>
                        <dd className="mt-0.5 tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {r.leadPending}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Project tracker
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                      <span>
                        Deadlines set:{" "}
                        <span className="tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">
                          {r.trackersSetCount}
                        </span>
                      </span>
                      <span className="text-neutral-400">·</span>
                      <span>
                        Emails sent:{" "}
                        <span className="tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">
                          {r.trackerCount}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "ml-auto inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                          r.hasSentTracker
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        )}
                      >
                        {r.hasSentTracker ? "Yes" : "No"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden min-w-0 md:block">
                <LenisScrollArea
                  axis="horizontal"
                  className="rounded-lg border border-border [-webkit-overflow-scrolling:touch]"
                >
                  <table className="w-full min-w-[58rem] text-sm">
                    <thead className="text-neutral-500 dark:text-neutral-400">
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th
                          rowSpan={2}
                          className="border-b border-neutral-200 px-3 py-2.5 text-left align-top font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                        >
                          User
                        </th>
                        <th
                          colSpan={3}
                          className="border-b border-neutral-200 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                          scope="colgroup"
                        >
                          Escalations
                        </th>
                        <th
                          colSpan={3}
                          className="border-b border-neutral-200 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                          scope="colgroup"
                        >
                          Leads
                        </th>
                        <th
                          colSpan={3}
                          className="border-b border-neutral-200 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                          scope="colgroup"
                        >
                          Project tracker
                        </th>
                      </tr>
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Escalation items in the last 30 days"
                        >
                          Total
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Threads where this user sent a reply from Sent"
                        >
                          Replied
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Escalations without a detected reply"
                        >
                          Pending
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Sales lead items (Hot / Warm / Cold) in the last 30 days"
                        >
                          Total
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Lead threads where this user sent a reply"
                        >
                          Replied
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Leads without a detected reply"
                        >
                          Pending
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Projects where an admin set a per-member tracker deadline for this user"
                        >
                          Deadlines set
                        </th>
                        <th
                          className="max-w-[5.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Qualifying tracker emails in the last 30 days"
                        >
                          Emails sent
                        </th>
                        <th
                          className="max-w-[4.5rem] px-2 py-2 text-center text-[11px] font-medium leading-tight"
                          title="Whether at least one qualifying tracker send appears in the last 30 days"
                        >
                          Sent?
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergedRows.map((r) => (
                        <tr key={r.email} className="border-b border-neutral-100 dark:border-neutral-800">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">
                              {r.displayName || r.email}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</div>
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.escalationCount}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.escalationReplied}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.escalationPending}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.leadCount}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.leadReplied}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.leadPending}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.trackersSetCount}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.trackerCount}</td>
                          <td className="px-3 py-2.5 text-center">
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
