"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem, RetagApprovalOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

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
    <div className="space-y-6">
      <div data-tour-id="retag-header">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">ReTag</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card data-tour-id="retag-list" className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Your retagged mail ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Nothing here yet. Use <strong>Retag</strong> on an escalation or lead in your mailbox.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/emails/${item.id}`}
                      className="font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                    >
                      {item.subject || "(No subject)"}
                    </Link>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{item.sender}</p>
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
          {totalPages > 1 && (
            <div data-tour-id="retag-pagination" className="mt-4 flex items-center justify-between">
              <p className="text-sm text-neutral-500">Page {page} of {totalPages}</p>
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
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Your approval requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No retag approval requests yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {requests.map((req) => (
                <li key={req.id} className="py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {req.emailSubject || req.emailId}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Team: <span className="font-medium text-indigo-700 dark:text-indigo-300">{req.requestedTeam}</span> ·
                        Requested {formatDate(req.requestedAt)}
                      </p>
                      {req.status === "rejected" && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Request rejected{req.reviewedAt ? ` on ${formatDate(req.reviewedAt)}` : ""}.
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
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
