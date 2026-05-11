"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TeamProjectOut } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectWorkflowAndTeamSection } from "@/components/projects/project-workflow-and-team";

export default function TemporaryTeamPage() {
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load temporary teams"))
      .finally(() => setLoading(false));
  }, [status, api]);

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          Temporary team
        </h1>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}
      {loading ? (
        <Skeleton className="h-48 w-full rounded-xl sm:h-64" />
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {projects.map((p) => (
            <section key={p.id} className="min-w-0 space-y-3 sm:space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-3 dark:bg-neutral-900/30 sm:p-4">
                <div className="space-y-3 sm:space-y-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Project name
                    </p>
                    <h2 className="mt-1 break-words text-lg font-bold leading-snug text-neutral-900 dark:text-neutral-50 sm:text-xl">
                      {p.name}
                    </h2>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Department
                    </p>
                    <p className="mt-1 break-words text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {p.teamName?.trim() ? p.teamName : "-"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Status
                    </p>
                    <p className="mt-1 break-words text-sm font-medium capitalize text-neutral-800 dark:text-neutral-200">
                      {p.status}
                    </p>
                  </div>
                </div>
              </div>
              <div className="min-w-0 space-y-4">
                <ProjectWorkflowAndTeamSection
                  project={p}
                  showPhaseWorkflow={false}
                  teamSectionAsAccordion
                />
              </div>
            </section>
          ))}
          {projects.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No project teams available.</p>
          )}
        </div>
      )}
    </div>
  );
}
