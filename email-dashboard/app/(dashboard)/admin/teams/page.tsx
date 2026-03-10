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
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Teams</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Teams</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Tech, Networking, Cybersecurity, Sales, Accounts, Data & AI. View members and team status.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const status = statusByTeam[team.id];
            return (
              <Card key={team.id} className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderOpen className="h-5 w-5" />
                    {team.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
                    </span>
                    {status && (
                      <>
                        <span className="flex items-center gap-1">
                          <Mail className="h-4 w-4" />
                          {status.emailsAssigned} assigned
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          {status.escalationsCount} escalation{status.escalationsCount !== 1 ? "s" : ""}
                        </span>
                        <span>{status.leadsCount} lead{status.leadsCount !== 1 ? "s" : ""}</span>
                      </>
                    )}
                  </div>
                  <Link href={`/admin/teams/${team.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-neutral-700 hover:underline dark:text-neutral-300">
                    View details
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!loading && teams.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No teams yet. Run the backend seed: python scripts/seed_teams.py</p>
      )}
    </div>
  );
}
