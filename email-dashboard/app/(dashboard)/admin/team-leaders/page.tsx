"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { UserOut, TeamOut, LoginEventOut, LoginSyncStatusOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, Users, LogIn } from "lucide-react";

function activityTimestampMs(iso: string | null | undefined): number {
  if (!iso?.trim()) return 0;
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function formatActivity(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

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
  const [loginEvents, setLoginEvents] = useState<LoginEventOut[]>([]);
  const [syncStatus, setSyncStatus] = useState<LoginSyncStatusOut | null>(null);
  const [me, setMe] = useState<{ userId?: string; isAdmin?: boolean; department?: string | null } | null>(null);
  const canEdit = !!me?.isAdmin;
  const loginRows = useMemo(() => {
    return [...loginEvents]
      .sort((a, b) => activityTimestampMs(b.loginAt) - activityTimestampMs(a.loginAt))
      .map((ev) => ({
        key: ev.id ?? `${ev.email}-${ev.loginAt}`,
        email: ev.email ?? "—",
        displayName: ev.displayName ?? ev.email ?? "—",
        loginAt: ev.loginAt ?? null,
        logoutAt: ev.logoutAt ?? null,
        isOnline: ev.isLoggedIn === true,
        loginSource: ev.loginSource ?? "—",
      }));
  }, [loginEvents]);

  const sortedAllUsers = useMemo(() => {
    const score = (u: UserOut) => activityTimestampMs(u.lastLoginAt) || activityTimestampMs(u.createdAt);
    return [...allUsers].sort((a, b) => score(b) - score(a));
  }, [allUsers]);

  const visibleAllUsers = useMemo(() => {
    if (canEdit) return sortedAllUsers;
    const managerId = (me?.userId ?? "").trim();
    if (!managerId) return [];
    return sortedAllUsers.filter((u) => u.managerId === managerId);
  }, [canEdit, sortedAllUsers, me?.userId]);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getMe().catch(() => null),
      api.getUsers({ role: "Manager" }),
      api.getTeams(),
      api.getUsers(),
      api.getLoginEvents({ limit: 1000 }).catch(() => [] as LoginEventOut[]),
      api.getLoginSyncStatus().catch(() => null as LoginSyncStatusOut | null),
    ])
      .then(([meResp, m, t, u, events, sync]) => {
        setMe(meResp ? { userId: meResp.userId, isAdmin: meResp.isAdmin, department: meResp.department ?? null } : null);
        setManagers(m);
        setTeams(t);
        setAllUsers(u);
        setLoginEvents(events);
        setSyncStatus(sync);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api]);

  const assignRole = (userId: string, role: string) => {
    if (!canEdit) return;
    setUpdatingId(userId);
    api.updateUser(userId, { role }).then(() => load()).catch(() => setError("Failed to update")).finally(() => setUpdatingId(null));
  };

  const assignTeam = (userId: string, teamId: string) => {
    if (!canEdit) return;
    setUpdatingId(userId);
    api.updateUser(userId, { teamId: teamId || undefined }).then(() => load()).catch(() => setError("Failed to update")).finally(() => setUpdatingId(null));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Team leaders</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Sync status</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : !syncStatus ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Status unavailable.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>
                Health:{" "}
                <span
                  className={
                    syncStatus.syncHealth === "healthy"
                      ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : syncStatus.syncHealth === "warning"
                        ? "rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        : "rounded bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  }
                >
                  {syncStatus.syncHealth}
                </span>
              </p>
              <p className="text-neutral-600 dark:text-neutral-300">
                Users: {syncStatus.totalUsers} · With last login: {syncStatus.usersWithLastLoginAt} · Missing last login:{" "}
                {syncStatus.usersMissingLastLoginAt}
              </p>
              <p className="text-neutral-600 dark:text-neutral-300">
                Active sessions: {syncStatus.activeSessions ?? 0} · Events (24h): oauth {syncStatus.oauthEvents24h} · session{" "}
                {syncStatus.sessionEvents24h} · total rows {syncStatus.totalLoginEvents}
              </p>
              <p className="text-neutral-500 dark:text-neutral-400">
                Last oauth event: {formatActivity(syncStatus.lastOauthEventAt)} · Last any event: {formatActivity(syncStatus.lastAnyEventAt)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LogIn className="h-5 w-5" />
            {canEdit ? "Login history" : "Login history (my department)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : loginRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No login events yet. Users will appear here after sign-in.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">User</th>
                    <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Login source</th>
                    <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Login time</th>
                    <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Logout time</th>
                    <th className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {loginRows.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        row.isOnline
                          ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                          : "bg-white dark:bg-transparent"
                      }
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">{row.displayName}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            row.loginSource === "oauth"
                              ? "rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                              : "rounded-md bg-slate-200 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                          }
                        >
                          {row.loginSource}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-800 dark:text-neutral-200">
                        {formatActivity(row.loginAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-800 dark:text-neutral-200">
                        {row.logoutAt ? formatActivity(row.logoutAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.isOnline ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            Logged in
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                            Logged out
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCircle className="h-5 w-5" />
            Managers {canEdit ? `(${managers.length})` : "(read only)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : managers.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No managers yet.
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
                    <Select value={u.teamId ?? ""} onValueChange={(tid) => assignTeam(u.id, tid)} disabled={!!updatingId || !canEdit}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No team</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
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
            {canEdit ? "All users — assign role or team (by recent activity)" : "Members assigned to me (read only)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? null : visibleAllUsers.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">No users. Create users via API or seed.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {visibleAllUsers.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{u.displayName ?? u.email}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {u.email} · {u.teamName ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Last visit: {formatActivity(u.lastLoginAt)} · Joined: {formatActivity(u.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={u.role} onValueChange={(role) => assignRole(u.id, role)} disabled={!!updatingId || !canEdit}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Member">Member</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={u.teamId ?? ""} onValueChange={(tid) => assignTeam(u.id, tid)} disabled={!!updatingId || !canEdit}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No team</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
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
