"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { getApi } from "@/lib/api/client";
import type { TeamOut, TeamStatusOut, UserOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, AlertCircle, Users } from "lucide-react";

export default function AdminTeamDetailPage() {
  const params = useParams();
  const teamId = params.id as string;
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [team, setTeam] = useState<TeamOut | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamStatusOut | null>(null);
  const [members, setMembers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !teamId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getTeam(teamId),
      api.getTeamStatus(teamId),
      api.getUsers({ teamId }),
    ])
      .then(([t, s, u]) => {
        setTeam(t);
        setTeamStatus(s ?? null);
        setMembers(u);
      })
      .catch(() => setError("Failed to load team"))
      .finally(() => setLoading(false));
  }, [status, api, teamId]);

  if (error) {
    return (
      <div className="min-w-0 max-w-full space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      {loading ? (
        <Skeleton className="h-44 w-full rounded-2xl sm:h-48" />
      ) : team ? (
        <>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
              {team.name}
            </h1>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
              {team.memberCount} members
            </p>
          </div>
          {teamStatus && (
            <Card className="min-w-0 rounded-2xl border-border">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base">Team status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:flex-row sm:flex-wrap sm:gap-6 sm:p-6 sm:pt-0">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 shrink-0" />
                  Emails assigned: {teamStatus.emailsAssigned}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Escalations: {teamStatus.escalationsCount}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Users className="h-4 w-4 shrink-0" />
                  Leads: {teamStatus.leadsCount}
                </span>
              </CardContent>
            </Card>
          )}
          <Card className="min-w-0 rounded-2xl border-border">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base">Members</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {members.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No members in this team yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {members.map((u) => (
                    <li
                      key={u.id}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium text-neutral-900 dark:text-neutral-50">
                          {u.displayName ?? u.email}
                        </p>
                        <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">
                          {u.email} · {u.role}
                          {u.isTeamLead ? " · Team lead" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                        {u.reportCount} report{u.reportCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Team not found.</p>
      )}
    </div>
  );
}
