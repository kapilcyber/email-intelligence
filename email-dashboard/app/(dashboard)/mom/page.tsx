"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import { sortMomRecordsByEndDesc, type MomRecord } from "@/lib/mom-storage";
import { formatMomTimeRange } from "@/lib/mom-eligibility";
import type { CalendarEventOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ClipboardList } from "lucide-react";

function parseForDisplay(r: MomRecord): string {
  const fake: CalendarEventOut = {
    id: r.eventKey,
    subject: r.subject,
    start: r.startISO ? { dateTime: r.startISO } : null,
    end: r.endISO ? { dateTime: r.endISO } : null,
    organizerName: null,
    organizerEmail: null,
    joinUrl: null,
    webLink: null,
    isCancelled: false,
    isOnlineMeeting: r.meetingType === "Online",
    location: null,
  };
  return formatMomTimeRange(fake);
}

type Filter = "all" | "sent" | "pending";

function statusBadge(status: MomRecord["status"]) {
  if (status === "sent") return <Badge variant="success">MOM sent</Badge>;
  if (status === "skipped") return <Badge variant="secondary">Skipped</Badge>;
  return <Badge variant="warning">Later (snoozed)</Badge>;
}

export default function MomHistoryPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const api = useMemo(() => getApi(email, session?.user?.name ?? null), [email, session?.user?.name]);
  const [rows, setRows] = useState<MomRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const refreshRows = useCallback(() => {
    if (!email || status !== "authenticated") {
      setRows([]);
      return;
    }
    api
      .getMomRecords()
      .then((r) => setRows(sortMomRecordsByEndDesc(r.records ?? [])))
      .catch(() => setRows([]));
  }, [api, email, status]);

  useEffect(() => {
    refreshRows();
  }, [refreshRows]);

  useEffect(() => {
    const onMom = () => refreshRows();
    window.addEventListener("mom-records-changed", onMom);
    return () => window.removeEventListener("mom-records-changed", onMom);
  }, [refreshRows]);

  const filtered = useMemo(() => {
    if (filter === "sent") return rows.filter((r) => r.status === "sent");
    if (filter === "pending") return rows.filter((r) => r.status === "snoozed");
    return rows;
  }, [rows, filter]);

  if (status === "loading") {
    return (
      <p className="min-h-[40vh] px-1 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          MOM history
        </h1>
      </div>

      <div data-tour-id="mom-filters" className="glass-surface rounded-2xl p-3 sm:p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Filter</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {(
            [
              ["all", "All"],
              ["sent", "MOM sent"],
              ["pending", "Pending / snoozed"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "min-h-10 w-full rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors sm:w-auto sm:min-h-0 sm:py-1.5 sm:text-left",
                filter === key
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-border bg-panel/50 text-neutral-600 hover:bg-panel-elevated/80 dark:text-neutral-400"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card data-tour-id="mom-meetings" className="rounded-2xl border-border">
        <CardHeader className="space-y-1 p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="min-w-0 break-words">Meetings</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {filtered.length === 0 ? (
            <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              No rows yet. After a meeting ends, you will get a prompt on any dashboard page. Actions you take appear
              here.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filtered.map((r) => (
                <li
                  key={r.eventKey}
                  className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-100 sm:line-clamp-none sm:text-base">
                      {r.subject}
                    </p>
                    <p className="mt-1 break-words text-sm text-neutral-600 dark:text-neutral-400">
                      {parseForDisplay(r)}
                    </p>
                    <p className="mt-1.5 break-words text-xs text-neutral-500 dark:text-neutral-500">
                      Type: {r.meetingType}
                      {r.sentAt && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="tabular-nums">Marked sent: {new Date(r.sentAt).toLocaleString()}</span>
                        </>
                      )}
                      {r.status === "snoozed" && r.snoozeUntil && Date.now() < r.snoozeUntil && (
                        <>
                          {" "}
                          ·{" "}
                          <span className="tabular-nums">
                            Next prompt: {new Date(r.snoozeUntil).toLocaleTimeString()}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 border-t border-neutral-100 pt-2 dark:border-neutral-800 sm:w-auto sm:border-t-0 sm:pt-0 sm:self-start">
                    <div className="sm:ml-auto">{statusBadge(r.status)}</div>
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
