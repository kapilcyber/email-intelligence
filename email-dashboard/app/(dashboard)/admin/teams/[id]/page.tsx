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
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : team ? (
        <>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{team.name}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{team.memberCount} members</p>
          </div>
          {teamStatus && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Team status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6">
                <span className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  Emails assigned: {teamStatus.emailsAssigned}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Escalations: {teamStatus.escalationsCount}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4" />
                  Leads: {teamStatus.leadsCount}
                </span>
              </CardContent>
            </Card>
          )}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Members</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No members in this team yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {members.map((u) => (
                    <li key={u.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">{u.displayName ?? u.email}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{u.email} · {u.role}{u.isTeamLead ? " · Team lead" : ""}</p>
                      </div>
                      <span className="text-sm text-neutral-500 dark:text-neutral-400">{u.reportCount} report{u.reportCount !== 1 ? "s" : ""}</span>
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
