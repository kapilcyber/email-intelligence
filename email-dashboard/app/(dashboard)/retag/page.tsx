"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem, RetagApprovalOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ListChecks, Tags } from "lucide-react";

const PAGE_SIZE = 20;

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  } catch {
    return s;
  }
}

export default function RetagPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [items, setItems] = useState<EscalationLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<RetagApprovalOut[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getRetagged({ page, pageSize: PAGE_SIZE })
      .then((r) => {
        setItems(r.retagged);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load ReTag mail"))
      .finally(() => setLoading(false));
  };

  const loadRequests = () => {
    if (status !== "authenticated") return;
    setRequestsLoading(true);
    api
      .getMyRetagRequests({ page: 1, pageSize: 50 })
      .then((r) => setRequests(r.requests ?? []))
      .catch(() => {})
      .finally(() => setRequestsLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api, page]);

  useEffect(() => {
    loadRequests();
  }, [status, api]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div data-tour-id="retag-header" className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">ReTag</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      <Card data-tour-id="retag-list" className="rounded-2xl">
        <CardHeader className="space-y-1 p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
            <Tags className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span className="min-w-0 break-words">
              Your retagged mail
              <span className="tabular-nums text-muted-foreground"> ({total})</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg sm:h-64" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Nothing here yet. Use <strong>Retag</strong> on an escalation or lead in your mailbox.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/emails/${item.id}`}
                      className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900 hover:underline dark:text-neutral-50 sm:line-clamp-none sm:text-base"
                    >
                      {item.subject || "(No subject)"}
                    </Link>
                    <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="font-medium text-neutral-600 dark:text-neutral-300">{item.sender}</span>
                    </p>
                  </div>
                  <div className="flex w-full justify-end border-t border-neutral-100 pt-2 dark:border-neutral-800 sm:w-auto sm:shrink-0 sm:justify-end sm:self-start sm:border-t-0 sm:pt-1">
                    <Link href={`/emails/${item.id}`} className="inline-flex shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 sm:h-9 sm:w-9 sm:justify-center sm:gap-0 sm:px-0"
                        aria-label="Open email"
                      >
                        <span className="sm:hidden">Open</span>
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div
              data-tour-id="retag-pagination"
              className="mt-4 grid grid-cols-1 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:order-1 sm:w-auto"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <p className="py-0.5 text-center text-sm text-neutral-500 dark:text-neutral-400 sm:order-2 sm:flex-1 sm:py-0">
                Page {page} of {totalPages}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:order-3 sm:w-auto"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-1 p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 break-words">Your approval requests</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {requestsLoading ? (
            <Skeleton className="h-32 w-full rounded-lg sm:h-40" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No retag approval requests yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {requests.map((req) => (
                <li key={req.id} className="py-3 first:pt-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-50 sm:line-clamp-none">
                        {req.emailSubject || req.emailId}
                      </p>
                      <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400">
                        Team:{" "}
                        <span className="font-medium text-indigo-700 dark:text-indigo-300">{req.requestedTeam}</span>
                        <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                        <span className="tabular-nums">Requested {formatDate(req.requestedAt)}</span>
                      </p>
                      {req.status === "rejected" && (
                        <p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">
                          Request rejected{req.reviewedAt ? ` on ${formatDate(req.reviewedAt)}` : ""}.
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex w-fit shrink-0 self-start rounded-full px-2.5 py-0.5 text-xs font-medium sm:self-center ${
                        req.status === "pending"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : req.status === "approved"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                      }`}
                    >
                      {req.status === "pending"
                        ? "Approval pending"
                        : req.status === "approved"
                          ? "Approved"
                          : "Rejected"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
