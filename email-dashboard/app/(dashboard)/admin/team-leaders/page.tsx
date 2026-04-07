"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { UserOut, TeamOut, LoginEventOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";
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
    api
      .getMe()
      .catch(() => null)
      .then((meResp) => {
        setMe(meResp ? { userId: meResp.userId, isAdmin: meResp.isAdmin, department: meResp.department ?? null } : null);
        const isAdminUser = !!meResp?.isAdmin;
        return Promise.all([
          api.getUsers({ role: "Manager" }),
          api.getTeams(),
          api.getUsers(),
          isAdminUser
            ? api.getLoginEvents({ limit: 1000 }).catch(() => [] as LoginEventOut[])
            : Promise.resolve([] as LoginEventOut[]),
        ]).then(([m, t, u, events]) => {
          setManagers(m);
          setTeams(t);
          setAllUsers(u);
          setLoginEvents(events);
        });
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  };

  const refreshLoginAudit = useCallback(() => {
    if (!me?.isAdmin) return;
    api
      .getLoginEvents({ limit: 1000 })
      .catch(() => [] as LoginEventOut[])
      .then(setLoginEvents);
  }, [api, me?.isAdmin]);

  useEffect(() => {
    load();
  }, [status, api]);

  /** Admins only: keep login table fresh while this page is open. */
  useEffect(() => {
    if (status !== "authenticated" || !me?.isAdmin) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      refreshLoginAudit();
    };
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [status, me?.isAdmin, refreshLoginAudit]);

  useEffect(() => {
    if (!me?.isAdmin) return;
    const onVis = () => {
      if (document.visibilityState === "visible") refreshLoginAudit();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [me?.isAdmin, refreshLoginAudit]);

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
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          Team leaders
        </h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      <Card className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug">
            <UserCircle className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span className="min-w-0 break-words">
              Managers
              <span className="tabular-nums text-muted-foreground"> ({managers.length})</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <Skeleton className="h-40 w-full rounded-lg sm:h-48" />
          ) : managers.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">No managers yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {managers.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-neutral-900 dark:text-neutral-50">
                      {u.displayName ?? u.email}
                    </p>
                    <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">{u.email}</p>
                    <p className="mt-1 break-words text-sm text-neutral-600 dark:text-neutral-300">
                      {u.teamName ?? "No team"} · {u.reportCount} report{u.reportCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="w-full border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:w-auto sm:shrink-0 sm:border-t-0 sm:pt-0">
                    <Select
                      value={u.teamId ?? ""}
                      onValueChange={(tid) => assignTeam(u.id, tid)}
                      disabled={!!updatingId || !canEdit}
                    >
                      <SelectTrigger className="h-10 w-full min-w-0 sm:w-[160px]">
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

      <Card className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-start gap-2 text-base leading-snug">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 break-words">
              {canEdit
                ? "All users — assign role or team (by recent activity)"
                : "Members assigned to me"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? null : visibleAllUsers.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
              No users. Create users via API or seed.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {visibleAllUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-neutral-900 dark:text-neutral-50">
                      {u.displayName ?? u.email}
                    </p>
                    <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">
                      {u.email} · {u.teamName ?? "—"}
                    </p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                      Last visit: <span className="tabular-nums">{formatActivity(u.lastLoginAt)}</span> · Joined:{" "}
                      <span className="tabular-nums">{formatActivity(u.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex w-full min-w-0 flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:border-t-0 sm:pt-0">
                    <Select
                      value={u.role}
                      onValueChange={(role) => assignRole(u.id, role)}
                      disabled={!!updatingId || !canEdit}
                    >
                      <SelectTrigger className="h-10 w-full min-w-0 sm:w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Member">Member</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={u.teamId ?? ""}
                      onValueChange={(tid) => assignTeam(u.id, tid)}
                      disabled={!!updatingId || !canEdit}
                    >
                      <SelectTrigger className="h-10 w-full min-w-0 sm:w-[140px]">
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

      {me?.isAdmin && (
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="space-y-2 p-4 sm:p-6">
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug">
              <LogIn className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="min-w-0 break-words">Login history (all users)</span>
            </CardTitle>
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              Live updates every 4s when this tab is visible. New sign-ins and logouts appear automatically.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <Skeleton className="h-28 w-full rounded-lg sm:h-32" />
            ) : loginRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No login events yet. Users will appear here after sign-in.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-neutral-200 rounded-lg border border-border dark:divide-neutral-700 md:hidden">
                  {loginRows.map((row) => (
                    <li
                      key={row.key}
                      className={cn(
                        "space-y-2 p-3",
                        row.isOnline ? "bg-emerald-50/70 dark:bg-emerald-950/20" : "bg-panel/30"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium text-neutral-900 dark:text-neutral-50">
                          {row.displayName}
                        </p>
                        <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">{row.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            row.loginSource === "oauth"
                              ? "rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                              : "rounded-md bg-slate-200 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                          }
                        >
                          {row.loginSource}
                        </span>
                        {row.isOnline ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            Logged in
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                            Logged out
                          </span>
                        )}
                      </div>
                      <dl className="grid gap-1.5 text-xs text-neutral-800 dark:text-neutral-200">
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                          <dt className="shrink-0 font-medium text-neutral-500 dark:text-neutral-400">Login</dt>
                          <dd className="min-w-0 break-words tabular-nums">{formatActivity(row.loginAt)}</dd>
                        </div>
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                          <dt className="shrink-0 font-medium text-neutral-500 dark:text-neutral-400">Logout</dt>
                          <dd className="min-w-0 break-words tabular-nums">
                            {row.logoutAt ? formatActivity(row.logoutAt) : "—"}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="hidden min-w-0 md:block">
                  <LenisScrollArea
                    axis="horizontal"
                    className="rounded-lg border border-border [-webkit-overflow-scrolling:touch]"
                  >
                    <table className="min-w-[640px] w-full text-left text-sm">
                      <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            User
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Login source
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Login time
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Logout time
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-50">
                            Status
                          </th>
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
                  </LenisScrollArea>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
