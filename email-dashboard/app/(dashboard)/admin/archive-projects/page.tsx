"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TeamProjectOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

export default function ArchiveProjectsPage() {
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
      .getProjectsWorkflow({ status: "completed" })
      .then((rows) => setProjects(rows))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load archive"))
      .finally(() => setLoading(false));
  }, [status, api]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Archive Projects</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Projects move here automatically when status is set to completed.
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Completed projects</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : projects.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No completed projects yet.</p>
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/team-projects/${p.id}`}
                  className="block rounded-lg border border-neutral-200 p-3 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {p.teamName ?? "No department"} · completed
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      Details
                      <ChevronRight className="h-4 w-4" aria-hidden />
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
