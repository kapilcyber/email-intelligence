"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TeamProjectOut } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectMailboxThreads } from "@/components/projects/project-mailbox-threads";
import { ProjectWorkflowAndTeamSection } from "@/components/projects/project-workflow-and-team";

export default function AdminProjectWorkflowPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [project, setProject] = useState<TeamProjectOut | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isManagerRole, setIsManagerRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !id) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getProjectWorkflow(id), api.getMe().catch(() => null)])
      .then(([p, me]) => {
        setProject(p);
        setMyUserId(me?.userId ?? null);
        setIsAdmin(Boolean(me?.isAdmin));
        setIsManagerRole((me?.role ?? "").trim() === "Manager");
      })
      .catch(() => {
        setError("Failed to load project.");
        setProject(null);
      })
      .finally(() => setLoading(false));
  }, [status, api, id]);

  const canViewMailboxThreads =
    project &&
    (isAdmin ||
      isManagerRole ||
      !project.createdByUserId ||
      !myUserId ||
      project.createdByUserId === myUserId);

  const projectCompleted = (project?.status ?? "").toLowerCase() === "completed";

  if (!id) {
    return (
      <div className="min-w-0 max-w-full p-4 text-sm text-neutral-500 sm:p-6">
        Invalid project.{" "}
        <Link
          href="/admin/team-projects"
          className="text-indigo-600 underline hover:no-underline dark:text-indigo-400"
        >
          View all projects
        </Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && project && (
        <>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
              {project.name}
            </h1>
            <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
              {project.teamName ?? "No department"} · <span className="capitalize">{project.status}</span>
              {typeof project.structure?.currentPhase === "number"
                ? ` · Phase ${project.structure.currentPhase}`
                : ""}
            </p>
            {project.projectLeadUserId && (
              <p className="mt-2 break-words text-sm text-indigo-800 dark:text-indigo-200">
                <span className="font-medium">Project lead:</span>{" "}
                {project.assignedUsers.find((x) => x.userId === project.projectLeadUserId)?.displayName ??
                  project.assignedUsers.find((x) => x.userId === project.projectLeadUserId)?.email ??
                  "—"}
              </p>
            )}
            {(!isAdmin || !projectCompleted) && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {isAdmin ? (
                  <Link href="/admin/team-projects" className="w-full sm:w-auto">
                    <Button variant="outline" size="sm" type="button" className="w-full sm:w-auto">
                      Edit on list
                    </Button>
                  </Link>
                ) : (
                  <Link href="/admin/my-projects" className="w-full sm:w-auto">
                    <Button variant="outline" size="sm" type="button" className="w-full sm:w-auto">
                      Back to projects
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <ProjectWorkflowAndTeamSection project={project} />
          </div>

          <div className="min-w-0 space-y-2">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Mailbox &amp; threads</h2>
            {canViewMailboxThreads ? (
              <ProjectMailboxThreads projectId={project.id} projectName={project.name} />
            ) : (
              <Card className="rounded-2xl border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20">
                <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-100">
                  Related inbox/spam threads are only available when you are the user who created this project, or when
                  you use your own mailbox as a manager. Open this project while signed in as the creating admin if you
                  need their thread list.
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
