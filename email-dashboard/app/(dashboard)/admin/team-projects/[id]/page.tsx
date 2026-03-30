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

  if (!id) {
    return (
      <div className="p-6 text-sm text-neutral-500">
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
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3 max-w-md" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loading && project && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{project.name}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {project.teamName ?? "No department"} · <span className="capitalize">{project.status}</span>
              {typeof project.structure?.currentPhase === "number"
                ? ` · Phase ${project.structure.currentPhase}`
                : ""}
            </p>
            {project.projectLeadUserId && (
              <p className="mt-2 text-sm text-indigo-800 dark:text-indigo-200">
                <span className="font-medium">Project lead:</span>{" "}
                {project.assignedUsers.find((x) => x.userId === project.projectLeadUserId)?.displayName ??
                  project.assignedUsers.find((x) => x.userId === project.projectLeadUserId)?.email ??
                  "—"}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {isAdmin ? (
                <Link href="/admin/team-projects">
                  <Button variant="outline" size="sm" type="button">
                    Edit on list
                  </Button>
                </Link>
              ) : (
                <Link href="/admin/my-projects">
                  <Button variant="outline" size="sm" type="button">
                    Back to projects
                  </Button>
                </Link>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              {isAdmin ? (
                <>
                  Open <strong>Projects</strong> in the sidebar and click <strong>Edit</strong> on this project to set{" "}
                  <strong>project lead</strong>, <strong>reports to on this project</strong>, roles, and assignments. This page
                  does <strong>not</strong> use Admin → Workflow (org Manager/Member/team lead).
                </>
              ) : (
                <>Manager view is read-only. Project role and assignment changes can only be made by admins.</>
              )}
            </p>
          </div>

          <div className="space-y-4">
            <ProjectWorkflowAndTeamSection project={project} />
          </div>

          <div className="space-y-2">
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
