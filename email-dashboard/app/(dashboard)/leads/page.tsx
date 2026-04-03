"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { List, ChevronRight } from "lucide-react";
import { RetagMailControl } from "@/components/escalations/retag-mail-control";
import { DateRangePair } from "@/components/ui/date-range-pair";

const PAGE_SIZE = 20;
const LEAD_LABELS = ["Hot", "Warm", "Cold"] as const;

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  } catch {
    return s;
  }
}

function leadBadgeClass(label: string | null | undefined) {
  if (!label) return "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300";
  switch (label) {
    case "Hot":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "Warm":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "Cold":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    default:
      return "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300";
  }
}

export default function LeadsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [items, setItems] = useState<EscalationLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getLeads({
        page,
        pageSize: PAGE_SIZE,
        from: fromDate || undefined,
        to: toDate || undefined,
        label: labelFilter || undefined,
        mine: true,
      })
      .then((r) => {
        setItems(r.leads);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load your leads"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api, page, labelFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">My Leads</h1>
      </div>

      <div data-tour-id="leads-filters" className="flex flex-wrap items-center gap-2">
        <select
          value={labelFilter}
          onChange={(e) => (setLabelFilter(e.target.value), setPage(1))}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">All leads</option>
          {LEAD_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <DateRangePair
          from={fromDate}
          to={toDate}
          onFromChange={(v) => {
            setFromDate(v);
            setPage(1);
          }}
          onToChange={(v) => {
            setToDate(v);
            setPage(1);
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card data-tour-id="leads-list" className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <List className="h-5 w-5" />
            My Leads ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No lead emails in your mailbox.
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item.leadLabel && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${leadBadgeClass(item.leadLabel)}`}>
                          {item.leadLabel}
                        </span>
                      )}
                      {item.assignedTeam && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">{item.assignedTeam}</span>
                      )}
                    </div>
                    {item.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{item.summary}</p>
                    )}
                    {item.buyingSignals && item.buyingSignals.length > 0 && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                        Signals: {item.buyingSignals.join(", ")}
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
          )}
          {totalPages > 1 && (
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
        </CardContent>
      </Card>
    </div>
  );
}
