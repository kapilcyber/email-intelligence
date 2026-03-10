"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { UserOut, TeamOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, Users } from "lucide-react";

export default function AdminTeamLeadersPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [managers, setManagers] = useState<UserOut[]>([]);
  const [teams, setTeams] = useState<TeamOut[]>([]);
  const [allUsers, setAllUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getUsers({ role: "Manager" }),
      api.getTeams(),
      api.getUsers(),
    ])
      .then(([m, t, u]) => {
        setManagers(m);
        setTeams(t);
        setAllUsers(u);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api]);

  const assignRole = (userId: string, role: string) => {
    setUpdatingId(userId);
    api.updateUser(userId, { role }).then(() => load()).catch(() => setError("Failed to update")).finally(() => setUpdatingId(null));
  };

  const assignTeam = (userId: string, teamId: string) => {
    setUpdatingId(userId);
    api.updateUser(userId, { teamId: teamId || undefined }).then(() => load()).catch(() => setError("Failed to update")).finally(() => setUpdatingId(null));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Team leaders</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Users with Manager role. Assign manager role or team.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle className="h-5 w-5" />
            Managers ({managers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : managers.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No managers yet. Assign role &quot;Manager&quot; to users in Workflow or create users first.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {managers.map((u) => (
                <li key={u.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{u.displayName ?? u.email}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{u.email}</p>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                      {u.teamName ?? "No team"} · {u.reportCount} report{u.reportCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={u.teamId ?? ""} onValueChange={(tid) => assignTeam(u.id, tid)} disabled={!!updatingId}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No team</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            All users — assign role or team
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? null : allUsers.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">No users. Create users via API or seed.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {allUsers.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{u.displayName ?? u.email}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {u.email} · {u.teamName ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={u.role} onValueChange={(role) => assignRole(u.id, role)} disabled={!!updatingId}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Member">Member</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={u.teamId ?? ""} onValueChange={(tid) => assignTeam(u.id, tid)} disabled={!!updatingId}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No team</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
