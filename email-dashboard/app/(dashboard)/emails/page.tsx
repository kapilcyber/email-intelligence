"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { EmailsTable } from "@/components/tables/emails-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { getApi } from "@/lib/api/client";
import type { EmailRecord } from "@/lib/types";
import { Search } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500];

/** Valid department/category values (must match Departments page) */
const CATEGORY_OPTIONS = ["Sales", "HR", "Accounts", "Tech", "General", "Spam"] as const;

export default function EmailsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(() => getApi(session?.user?.email ?? null), [session?.user?.email]);
  const searchParams = useSearchParams();
  const categoryFromUrl = searchParams.get("category") ?? "";
  const category = categoryFromUrl && CATEGORY_OPTIONS.includes(categoryFromUrl as (typeof CATEGORY_OPTIONS)[number])
    ? categoryFromUrl
    : "";

  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
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

  // Reset to page 1 when category (from URL) changes
  useEffect(() => {
    setPage(1);
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Emails</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {category ? (
              <>Showing <strong>{category}</strong> only · {total} email{total !== 1 ? "s" : ""}</>
            ) : (
              "Ingested messages with AI summary and priority."
            )}
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-0 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search subject, sender..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                placeholder="From"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full sm:w-36"
              />
              <Input
                type="date"
                placeholder="To"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full sm:w-36"
              />
            </div>
            <Button variant="outline" onClick={load}>
              Apply
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">Show</span>
            <Select
              value={String(pageSize)}
              onValueChange={handlePageSizeChange}
              className="w-20"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </Select>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              per page · {total} total
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <EmailsTable
          emails={emails}
          isLoading={loading}
          emptyMessage={category ? `No emails in ${category}.` : "No emails match your filters."}
          getEmailLink={(e) => `/emails/${e.id}`}
        />

        {totalPages > 1 && (
          <div className="flex justify-between">
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
