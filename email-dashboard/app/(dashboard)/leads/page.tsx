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

  const selectClass =
    "h-10 min-w-0 w-full rounded-lg border border-border bg-panel px-3 text-sm text-foreground shadow-sm " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          My Leads
        </h1>
      </div>

      <div data-tour-id="leads-filters" className="glass-surface rounded-2xl p-3 sm:p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-end sm:gap-6">
          <div className="min-w-0">
            <label htmlFor="leads-label-filter" className="mb-2 block text-xs font-medium text-muted-foreground">
              Lead label
            </label>
            <select
              id="leads-label-filter"
              value={labelFilter}
              onChange={(e) => (setLabelFilter(e.target.value), setPage(1))}
              className={selectClass}
              aria-label="Filter by lead label"
            >
              <option value="">All leads</option>
              {LEAD_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Received date</p>
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
              className="w-full min-w-0"
              fieldClassName="relative min-w-0 flex-1"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      <Card data-tour-id="leads-list" className="rounded-2xl">
        <CardHeader className="space-y-1 p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
            <List className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 break-words">
              My Leads
              <span className="tabular-nums text-muted-foreground"> ({total})</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg sm:h-64" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No lead emails in your mailbox.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
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
                      <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                      <span className="tabular-nums">{formatDate(item.receivedAt)}</span>
                      <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                      {item.priorityLabel ?? "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {item.leadLabel && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${leadBadgeClass(item.leadLabel)}`}
                        >
                          {item.leadLabel}
                        </span>
                      )}
                      {item.assignedTeam && (
                        <span className="min-w-0 break-words text-xs text-neutral-500 dark:text-neutral-400">
                          {item.assignedTeam}
                        </span>
                      )}
                    </div>
                    {item.summary && (
                      <p className="mt-1.5 line-clamp-3 text-sm text-neutral-600 dark:text-neutral-300 sm:line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                    {item.buyingSignals && item.buyingSignals.length > 0 && (
                      <p className="mt-1.5 line-clamp-3 break-words text-xs text-emerald-600 dark:text-emerald-400 sm:line-clamp-2">
                        Signals: {item.buyingSignals.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full min-w-0 flex-row items-center justify-between gap-2 border-t border-neutral-100 pt-2 dark:border-neutral-800 sm:w-auto sm:shrink-0 sm:items-center sm:justify-end sm:gap-2 sm:self-start sm:border-t-0 sm:pt-1">
                    <RetagMailControl emailId={item.id} onDone={load} compact />
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
            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
    </div>
  );
}
