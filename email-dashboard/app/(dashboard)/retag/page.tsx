"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tags, ChevronRight } from "lucide-react";

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

  useEffect(() => {
    load();
  }, [status, api, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <Tags className="h-6 w-6" />
          ReTag
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Mail you moved out of <strong>Escalations</strong> or <strong>Leads</strong> into another department. These stay
          out of escalation/lead even after re-classification.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="rounded-2xl">
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
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {item.sender} · {formatDate(item.receivedAt)} · Dept:{" "}
                      <span className="font-medium text-indigo-700 dark:text-indigo-300">{item.assignedTeam ?? "—"}</span>
                    </p>
                    {item.retaggedAt && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Retagged {formatDate(item.retaggedAt)}
                        {item.retaggedBy ? ` by ${item.retaggedBy}` : ""}
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
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
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
    </div>
  );
}
