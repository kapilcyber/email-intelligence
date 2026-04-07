"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TeamProjectOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, FolderKanban } from "lucide-react";

export default function ManagerProjectsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [projects, setProjects] = useState<TeamProjectOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getProjectsWorkflow()
      .then((rows) => setProjects(rows))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  }, [status, api]);

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Projects</h1>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}
      <Card className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug">
            <FolderKanban className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span className="min-w-0 break-words">Assigned projects</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <Skeleton className="h-44 w-full rounded-lg sm:h-48" />
          ) : projects.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No projects are assigned yet.</p>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/team-projects/${p.id}`}
                  className="block min-w-0 overflow-hidden rounded-lg border border-border bg-panel/30 p-3 transition-colors hover:bg-panel-elevated/50 dark:hover:bg-neutral-800/40"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium leading-snug text-neutral-900 dark:text-neutral-100">{p.name}</p>
                      <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400">
                        {p.teamName ?? "No department"}
                        <span className="text-neutral-400 dark:text-neutral-500"> · </span>
                        <span className="capitalize">{p.status}</span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center justify-end gap-1 self-end text-xs font-medium text-indigo-600 dark:text-indigo-400 sm:self-start sm:justify-start">
                      Details
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
