"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TrackerEmailListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function formatReceived(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatRange(startISO: string, endISO: string): string {
  try {
    const a = new Date(startISO);
    const b = new Date(endISO);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    return `${a.toLocaleDateString(undefined, opts)} - ${b.toLocaleDateString(undefined, opts)} (UTC)`;
  } catch {
    return `${startISO} - ${endISO}`;
  }
}

export default function AdminTrackerProjectHistoryPage() {
  const params = useParams();
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Tracker history");
  const [rangeText, setRangeText] = useState("");
  const [rows, setRows] = useState<TrackerEmailListItem[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!projectId || status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getAdminTrackerProjectEmails(projectId, { days, limit: 300 })
      .then((r) => {
        setProjectName(r.projectName || "Tracker history");
        setRangeText(formatRange(r.weekStartISO, r.weekEndISO));
        setRows(r.emails ?? []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load tracker history");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [api, projectId, status, days, reloadTick]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/tracker" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to Tracker
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{projectName}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Matching tracker mails history. Showing last {days} days.
          </p>
          {rangeText && <p className="text-xs text-neutral-400 dark:text-neutral-500">{rangeText}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setReloadTick((n) => n + 1)} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={days === d ? "default" : "outline"}
            onClick={() => setDays(d as 7 | 30 | 90)}
          >
            Last {d} days
          </Button>
        ))}
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Emails ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No matching tracker emails for selected range.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((item) => (
                <li key={item.emailId}>
                  <Link
                    href={`/emails/${item.emailId}`}
                    className="block rounded-lg border border-neutral-200 bg-neutral-50/80 p-3 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:bg-neutral-800"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {item.subject?.trim() || "(No subject)"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatReceived(item.receivedAt)} · {item.senderEmail}
                      {item.mailboxOwnerEmail ? ` · ${item.mailboxOwnerEmail}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
