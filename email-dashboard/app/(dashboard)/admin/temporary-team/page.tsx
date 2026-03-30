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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Temporary team</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Per-project reporting structure for temporary teams (phase workflow is only on the full project page).
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="space-y-8">
          {projects.map((p) => (
            <section key={p.id} className="space-y-4">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/30">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Project name
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-neutral-900 dark:text-neutral-50">{p.name}</h2>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Department
                    </p>
                    <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {p.teamName?.trim() ? p.teamName : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Status
                    </p>
                    <p className="mt-1 text-sm font-medium capitalize text-neutral-800 dark:text-neutral-200">{p.status}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
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
