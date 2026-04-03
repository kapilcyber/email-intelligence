"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { EmailsTable } from "@/components/tables/emails-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { getApi } from "@/lib/api/client";
import type { EmailRecord } from "@/lib/types";
import { Search } from "lucide-react";
import { DEPARTMENT_CATEGORIES } from "@/lib/departments";
import { DateRangePair } from "@/components/ui/date-range-pair";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500];

type Props = {
  /** Filter by AI category / department; empty = all. */
  categoryFilter: string;
  /** Page heading (main title). */
  title?: string;
  /** Optional subtitle under title. */
  description?: ReactNode;
  /** When true, hide the title subtitle and the default “Showing category only” line. */
  suppressSubtitle?: boolean;
  /** Show per-row Retag (non-admin → admin approval; admin → immediate). */
  showRetag?: boolean;
  /** Initial search query from URL/state. */
  initialSearch?: string;
};

export function EmailsView({
  categoryFilter,
  title,
  description,
  suppressSubtitle = false,
  showRetag = false,
  initialSearch = "",
}: Props) {
  const category = useMemo(() => {
    if (!categoryFilter) return "";
    return DEPARTMENT_CATEGORIES.includes(categoryFilter as (typeof DEPARTMENT_CATEGORIES)[number])
      ? categoryFilter
      : "";
  }, [categoryFilter]);

  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState(initialSearch);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const load = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getEmails({
        page,
        pageSize,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
        category: category || undefined,
      })
      .then((r) => {
        setEmails(r.emails);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load emails"))
      .finally(() => setLoading(false));
  }, [status, api, page, pageSize, search, from, to, category]);

  useEffect(() => {
    setPage(1);
  }, [category]);

  useEffect(() => {
    setSearch(initialSearch);
    setPage(1);
  }, [initialSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const defaultTitle = title ?? "Emails";
  const defaultDescription = suppressSubtitle
    ? null
    : (description ??
      (category ? (
        <>
          Showing <strong>{category}</strong> only · {total} email{total !== 1 ? "s" : ""}
        </>
      ) : null));

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-6">
        <div data-tour-id="emails-header">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{defaultTitle}</h1>
          {defaultDescription ? (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{defaultDescription}</p>
          ) : null}
        </div>

        <div
          data-tour-id="emails-filters"
          className="glass-surface rounded-2xl p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative min-w-0 flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search subject, sender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                className="pl-9"
              />
            </div>
            <DateRangePair from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <Button variant="outline" onClick={load}>
              Apply
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange} className="w-20">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </Select>
            <span className="text-sm text-muted-foreground">
              per page · {total} total
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <div data-tour-id="emails-table">
          <EmailsTable
            emails={emails}
            isLoading={loading}
            emptyMessage={category ? `No emails in ${category}.` : "No emails match your filters."}
            getEmailLink={(e) => `/emails/${e.id}`}
            showRetag={showRetag}
            onRetagDone={load}
          />
        </div>

        {totalPages > 1 && (
          <div data-tour-id="emails-pagination" className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
