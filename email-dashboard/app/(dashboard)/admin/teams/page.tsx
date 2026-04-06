"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi } from "@/lib/api/client";
import type { TeamOut, TeamStatusOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, ChevronRight, Mail, AlertCircle, Users } from "lucide-react";

export default function AdminTeamsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [teams, setTeams] = useState<TeamOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusByTeam, setStatusByTeam] = useState<Record<string, TeamStatusOut>>({});

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getTeams()
      .then((list) => {
        setTeams(list);
        return Promise.all(list.map((t) => api.getTeamStatus(t.id).catch(() => null)));
      })
      .then((statuses) => {
        const map: Record<string, TeamStatusOut> = {};
        statuses.forEach((s) => {
          if (s) map[s.teamId] = s;
        });
        setStatusByTeam(map);
      })
      .catch(() => setError("Failed to load teams"))
      .finally(() => setLoading(false));
  }, [status, api]);

  if (error) {
    return (
      <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Teams</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Teams</h1>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
          Member counts, mail assignment, escalations, and leads per team.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl sm:h-64" />
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {teams.map((team) => {
            const status = statusByTeam[team.id];
            return (
              <Card key={team.id} className="min-w-0 max-w-full rounded-2xl border-border">
                <CardHeader className="space-y-0 p-4 pb-2 sm:p-6 sm:pb-2">
                  <CardTitle className="flex items-start gap-2 text-base leading-snug">
                    <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="min-w-0 break-words">{team.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
                  <div className="flex flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-400 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="tabular-nums">
                        {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
                      </span>
                    </span>
                    {status && (
                      <>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Mail className="h-4 w-4 shrink-0" />
                          <span className="tabular-nums">{status.emailsAssigned} assigned</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span className="tabular-nums">
                            {status.escalationsCount} escalation{status.escalationsCount !== 1 ? "s" : ""}
                          </span>
                        </span>
                        <span className="tabular-nums sm:ml-0">
                          {status.leadsCount} lead{status.leadsCount !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </div>
                  <Link
                    href={`/admin/teams/${team.id}`}
                    className="flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-border bg-panel/60 px-3 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-panel-elevated/80 dark:text-neutral-100 sm:inline-flex sm:min-h-9 sm:w-auto sm:justify-start sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:hover:bg-transparent sm:hover:underline"
                  >
                    View details
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!loading && teams.length === 0 && (
        <p className="break-words text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          No teams yet. Run the backend seed: python scripts/seed_teams.py
        </p>
      )}
    </div>
  );
}
