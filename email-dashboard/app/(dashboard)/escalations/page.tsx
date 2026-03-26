"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronRight, Tags } from "lucide-react";
import { RetagMailControl } from "@/components/escalations/retag-mail-control";

const PAGE_SIZE = 20;

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  } catch {
    return s;
  }
}

export default function EscalationsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [items, setItems] = useState<EscalationLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"escalations" | "retag">("escalations");
  const [retagItems, setRetagItems] = useState<EscalationLeadItem[]>([]);
  const [retagTotal, setRetagTotal] = useState(0);
  const [retagPage, setRetagPage] = useState(1);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getEscalations({
        page,
        pageSize: PAGE_SIZE,
        from: fromDate || undefined,
        mine: true,
      })
      .then((r) => {
        setItems(r.escalations);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load your escalations"))
      .finally(() => setLoading(false));
  };

  const loadRetag = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getRetagged({ page: retagPage, pageSize: PAGE_SIZE, from: fromDate || undefined })
      .then((r) => {
        setRetagItems(r.retagged);
        setRetagTotal(r.total);
      })
      .catch(() => setError("Failed to load ReTag list"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tab === "escalations") load();
    else loadRetag();
  }, [status, api, page, fromDate, tab, retagPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const retagTotalPages = Math.max(1, Math.ceil(retagTotal / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">My Escalations</h1>
        <div data-tour-id="escalations-tabs" className="mt-3 inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => (setTab("escalations"), setPage(1))}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "escalations"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-600 dark:text-neutral-400"
            }`}
          >
            Escalations
          </button>
          <button
            type="button"
            onClick={() => (setTab("retag"), setRetagPage(1))}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "retag"
                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                : "text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <Tags className="h-3.5 w-3.5" />
            ReTag
          </button>
        </div>
      </div>

      <div data-tour-id="escalations-filters" className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={fromDate}
          onChange={(e) => (setFromDate(e.target.value), setPage(1), setRetagPage(1))}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card data-tour-id="escalations-list" className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {tab === "escalations" ? (
              <>
                <AlertCircle className="h-5 w-5" />
                My Escalations ({total})
              </>
            ) : (
              <>
                <Tags className="h-5 w-5" />
                ReTag ({retagTotal})
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : tab === "escalations" ? (
            items.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No escalation emails in your mailbox.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/emails/${item.id}`}
                        className="font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                      >
                        {item.subject || "(No subject)"}
                      </Link>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {item.sender} · {formatDate(item.receivedAt)} · {item.priorityLabel ?? "—"}
                      </p>
                      {item.summary && (
                        <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{item.summary}</p>
                      )}
                      {item.escalationReasons && item.escalationReasons.length > 0 && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Reasons: {item.escalationReasons.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                      <RetagMailControl emailId={item.id} onDone={load} compact />
                      <Link href={`/emails/${item.id}`}>
                        <Button variant="ghost" size="icon">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : retagItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No retagged mail yet. Use Retag on an escalation above.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {retagItems.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/emails/${item.id}`}
                      className="font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                    >
                      {item.subject || "(No subject)"}
                    </Link>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      Dept: {item.assignedTeam ?? "—"} · {item.sender} · {formatDate(item.receivedAt)}
                    </p>
                    {item.retaggedAt && (
                      <p className="text-xs text-neutral-500">
                        Retagged {formatDate(item.retaggedAt)}
                        {item.retagPreviousSummary ? ` · ${item.retagPreviousSummary}` : ""}
                      </p>
                    )}
                  </div>
                  <Link href={`/emails/${item.id}`}>
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {tab === "escalations" && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
          {tab === "retag" && retagTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Page {retagPage} of {retagTotalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={retagPage <= 1} onClick={() => setRetagPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retagPage >= retagTotalPages}
                  onClick={() => setRetagPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
