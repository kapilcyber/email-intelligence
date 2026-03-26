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
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">MOM history</h1>
      </div>

      <div data-tour-id="mom-filters" className="flex flex-wrap gap-2">
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
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              filter === key
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card data-tour-id="mom-meetings" className="rounded-2xl border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="text-base">Meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No rows yet. After a meeting ends, you will get a prompt on any dashboard page. Actions you take appear
              here.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filtered.map((r) => (
                <li key={r.eventKey} className="flex flex-col gap-1 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{r.subject}</p>
                    <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{parseForDisplay(r)}</p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                      Type: {r.meetingType}
                      {r.sentAt && (
                        <>
                          {" "}
                          · Marked sent: {new Date(r.sentAt).toLocaleString()}
                        </>
                      )}
                      {r.status === "snoozed" && r.snoozeUntil && Date.now() < r.snoozeUntil && (
                        <>
                          {" "}
                          · Next prompt: {new Date(r.snoozeUntil).toLocaleTimeString()}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 pt-1 sm:pt-0">{statusBadge(r.status)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
