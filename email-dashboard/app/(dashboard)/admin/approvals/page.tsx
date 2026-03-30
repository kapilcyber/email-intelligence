"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { RetagApprovalOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(s?: string | null) {
  if (!s) return "—";
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
    <div className="space-y-6" data-tour-id="approvals-header">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Approvals</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card data-tour-id="approvals-list" className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">ReTag approvals ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-56 w-full rounded-lg" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {items.map((item) => (
                <li key={item.id} className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                        {item.emailSubject || "(No subject)"}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Sender: {item.sender || "—"} · Requested by: {item.requestedByEmail}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Mailbox: {item.mailboxOwnerEmail} · Team: {item.requestedTeam}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Requested: {formatDate(item.requestedAt)} · Status:{" "}
                        <span className="font-medium">{item.status}</span>
                      </p>
                    </div>
                    {item.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={busyId === item.id}
                          onClick={() => act(item, true)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
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
