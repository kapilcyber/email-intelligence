"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { EscalationLeadItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Mail, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;
const TEAM_OPTIONS = ["Tech", "Networking", "Cybersecurity", "Sales", "Accounts", "Data & AI", "General"];

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  } catch {
    return s;
  }
}

export default function AdminEscalationsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [items, setItems] = useState<EscalationLeadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getEscalations({
        page,
        pageSize: PAGE_SIZE,
        from: fromDate || undefined,
        team: teamFilter || undefined,
      })
      .then((r) => {
        setItems(r.escalations);
        setTotal(r.total);
      })
      .catch(() => setError("Failed to load escalations"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api, page, teamFilter, fromDate]);

  const assignToTeam = (emailId: string, team: string) => {
    setAssigningId(emailId);
    api
      .assignEmailToTeam(emailId, team)
      .then(() => load())
      .catch(() => setError("Failed to assign"))
      .finally(() => setAssigningId(null));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Escalations</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Emails flagged as escalations (Critical/High priority). Assign to a team below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={teamFilter || "all"} onValueChange={(v) => (setTeamFilter(v === "all" ? "" : v), setPage(1))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {TEAM_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="date"
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={fromDate}
          onChange={(e) => (setFromDate(e.target.value), setPage(1))}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5" />
            Escalations ({total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">No escalations found.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                    {item.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{item.summary}</p>
                    )}
                    {item.escalationReasons && item.escalationReasons.length > 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Reasons: {item.escalationReasons.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {item.assignedTeam ?? "Unassigned"}
                    </span>
                    <Select
                      value={item.assignedTeam ?? ""}
                      onValueChange={(team) => assignToTeam(item.id, team)}
                      disabled={!!assigningId}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Assign" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
