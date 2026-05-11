"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { getApi } from "@/lib/api/client";
import type { EmailRecord } from "@/lib/types";
import { EmailsTable } from "@/components/tables/emails-table";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

const DIRECTION_PILLS: { slug: string; label: string }[] = [
  { slug: "all", label: "All" },
  { slug: "sent", label: "Sent" },
  { slug: "received", label: "Received" },
];

function normalizeDirection(raw: string | null): "" | "sent" | "received" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "sent" || v === "received") return v;
  return "";
}

function ExternalMailContent() {
  const searchParams = useSearchParams();
  const directionFilter = useMemo(() => normalizeDirection(searchParams.get("direction")), [searchParams]);

  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getAdminEmails({
        page,
        pageSize: PAGE_SIZE,
        mailDirection: directionFilter || undefined,
        // Received: only mail From outside internal domain (@cachedigitech.com via backend setting).
        // Sent: internal From to external recipients. All: any cross-domain participant.
        ...(directionFilter === "received"
          ? { externalSendersOnly: true }
          : { externalParticipants: true }),
      })
      .then((r) => {
        setEmails(r.emails);
        setTotal(r.total);
      })
      .catch((e: Error) => {
        setError(e.message?.includes("403") ? "Admin access required." : "Failed to load external mail.");
      })
      .finally(() => setLoading(false));
  }, [status, api, page, directionFilter]);

  useEffect(() => {
    setPage(1);
  }, [directionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildPillHref = (slug: string) => {
    const p = new URLSearchParams();
    if (slug === "received") p.set("direction", "received");
    if (slug === "sent") p.set("direction", "sent");
    const q = p.toString();
    return q ? `/admin/external-mail?${q}` : "/admin/external-mail";
  };

  const emptyLabel =
    directionFilter === "sent"
      ? "No sent external mail."
      : directionFilter === "received"
        ? "No received external mail."
        : "No cross-domain messages.";

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          External mail
        </h1>
      </div>

      <nav
        className="-mx-0.5 flex min-w-0 flex-wrap items-center gap-1.5 gap-y-2 sm:gap-2"
        aria-label="Sent or received"
      >
        {DIRECTION_PILLS.map(({ slug, label }) => {
          const active =
            slug === "all" ? !directionFilter : directionFilter === slug;
          return (
            <Link
              key={slug}
              href={buildPillHref(slug)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-border/90 bg-panel/90 text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <EmailsTable
        emails={emails}
        isLoading={loading}
        emptyMessage={emptyLabel}
        readOnly
        showRetag={false}
        showMailbox
        hideDepartmentPriorityFolder
      />

      {totalPages > 1 && (
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="py-1 text-center text-sm text-muted-foreground sm:flex-1">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminExternalMailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ExternalMailContent />
    </Suspense>
  );
}
