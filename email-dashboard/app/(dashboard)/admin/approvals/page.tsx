"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { RetagApprovalOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";

function formatDate(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
}

export default function AdminApprovalsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [items, setItems] = useState<RetagApprovalOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getRetagApprovals({ status: "pending", pageSize: 200 })
      .then(setItems)
      .catch(() => setError("Failed to load approval requests"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api]);

  const act = (item: RetagApprovalOut, approve: boolean) => {
    setBusyId(item.id);
    const req = approve ? api.approveRetagRequest(item.id) : api.rejectRetagRequest(item.id);
    req
      .then(() => load())
      .catch(() => setError(approve ? "Failed to approve request" : "Failed to reject request"))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6" data-tour-id="approvals-header">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Approvals</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      <Card data-tour-id="approvals-list" className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 break-words">
              ReTag approvals
              <span className="tabular-nums text-muted-foreground"> ({items.length})</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <Skeleton className="h-44 w-full rounded-lg sm:h-56" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {items.map((item) => (
                <li key={item.id} className="py-3 first:pt-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-50 sm:line-clamp-none sm:text-base">
                        {item.emailSubject || "(No subject)"}
                      </p>
                      <p className="mt-1.5 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Sender:</span>{" "}
                        {item.sender || "-"}
                        <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Requested by:</span>{" "}
                        <span className="break-all">{item.requestedByEmail}</span>
                      </p>
                      <p className="mt-1 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Mailbox:</span>{" "}
                        <span className="break-all">{item.mailboxOwnerEmail}</span>
                        <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Team:</span>{" "}
                        {item.requestedTeam}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Requested:</span>{" "}
                        <span className="tabular-nums">{formatDate(item.requestedAt)}</span>
                        <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Status:</span>{" "}
                        <span className="capitalize">{item.status}</span>
                      </p>
                    </div>
                    {item.status === "pending" && (
                      <div className="flex w-full min-w-0 flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:w-auto sm:shrink-0 sm:flex-row sm:border-t-0 sm:pt-0">
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 w-full text-xs sm:h-8 sm:w-auto"
                          disabled={busyId === item.id}
                          onClick={() => act(item, true)}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-10 w-full text-xs sm:h-8 sm:w-auto"
                          disabled={busyId === item.id}
                          onClick={() => act(item, false)}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
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
