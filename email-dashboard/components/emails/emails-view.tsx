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
  /** Show per-row Retag (non-admin → admin approval; admin → immediate). */
  showRetag?: boolean;
  /** Initial search query from URL/state. */
  initialSearch?: string;
};

export function EmailsView({
  categoryFilter,
  title,
  description,
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
  const defaultDescription = description ?? null;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 sm:gap-6">
      <div className="min-w-0 space-y-4 sm:space-y-6">
        <div data-tour-id="emails-header" className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-2xl">
            {defaultTitle}
          </h1>
          {defaultDescription ? (
            <p className="mt-1.5 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:mt-1 sm:text-sm">
              {defaultDescription}
            </p>
          ) : null}
        </div>

        <div
          data-tour-id="emails-filters"
          className="glass-surface flex flex-col gap-4 rounded-2xl p-3 sm:p-4 md:flex-row md:items-center md:justify-between md:gap-6"
        >
          <div className="flex min-w-0 flex-col gap-3 md:min-w-0 md:flex-1 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-0 w-full md:w-64 md:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search subject, sender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                className="pl-9"
              />
            </div>
            <DateRangePair
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              className="w-full min-w-0 md:w-auto"
              fieldClassName="relative min-w-0 flex-1"
            />
            <Button type="button" variant="outline" className="w-full shrink-0 md:w-auto" onClick={load}>
              Apply
            </Button>
          </div>
          <div
            className="flex min-w-0 shrink-0 flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 md:border-l md:border-t-0 md:pt-0 md:pl-6"
            role="group"
            aria-label="Pagination page size"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={handlePageSizeChange}
                className="w-[5.75rem] shrink-0 sm:w-24"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <p className="min-w-0 text-sm leading-snug text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{total}</span>
              {" "}
              email{total !== 1 ? "s" : ""} total
            </p>
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
          <div
            data-tour-id="emails-pagination"
            className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <span className="py-1 text-center text-sm text-neutral-500 dark:text-neutral-400 sm:order-none sm:flex-1">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
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
