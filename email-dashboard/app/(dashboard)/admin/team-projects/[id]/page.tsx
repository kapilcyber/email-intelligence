"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TeamProjectOut, ProjectAssignmentOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, GitBranch, Network, User } from "lucide-react";
import { ProjectMailboxThreads } from "@/components/projects/project-mailbox-threads";

/** Tree node: assignment row + nested children (project reporting only). */
interface ProjectMemberTreeNode extends ProjectAssignmentOut {
  children: ProjectMemberTreeNode[];
}

/** Resolve project-only manager link; drops invalid targets and simple cycles. */
function computeEffectiveProjectParents(assignments: ProjectAssignmentOut[]): Map<string, string | null> {
  const idSet = new Set(assignments.map((a) => a.userId));
  const raw = new Map(assignments.map((a) => [a.userId, a.reportsToUserId ?? null]));
  const result = new Map<string, string | null>();
  for (const a of assignments) {
    const direct = raw.get(a.userId) ?? null;
    let parent: string | null = null;
    if (direct && idSet.has(direct) && direct !== a.userId) {
      let cur: string | null = direct;
      const seen = new Set<string>();
      let valid = true;
      while (cur) {
        if (cur === a.userId) {
          valid = false;
          break;
        }
        if (seen.has(cur)) {
          valid = false;
          break;
        }
        seen.add(cur);
        const next = raw.get(cur) ?? null;
        if (!next || !idSet.has(next)) break;
        cur = next;
      }
      if (valid) parent = direct;
    }
    result.set(a.userId, parent);
  }
  return result;
}

function projectRoleBadge(role: string | null | undefined): {
  label: string;
  variant: "default" | "warning" | "secondary" | "success";
} {
  const r = (role ?? "").trim();
  if (!r) return { label: "Team member", variant: "secondary" };
  const lower = r.toLowerCase();
  if (r === "TL" || lower === "team lead" || lower === "tl") return { label: "TL", variant: "success" };
  if (r === "Manager" || lower === "manager") return { label: "Manager", variant: "warning" };
  return { label: r, variant: "secondary" };
}

function buildProjectAssignmentTree(assignments: ProjectAssignmentOut[]): ProjectMemberTreeNode[] {
  const parents = computeEffectiveProjectParents(assignments);
  const byId = new Map<string, ProjectMemberTreeNode>();
  for (const a of assignments) {
    byId.set(a.userId, { ...a, children: [] });
  }
  const roots: ProjectMemberTreeNode[] = [];
  for (const a of assignments) {
    const node = byId.get(a.userId)!;
    const p = parents.get(a.userId);
    const parentNode = p ? byId.get(p) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function ProjectHierarchyNode({
  node,
  projectLeadUserId,
}: {
  node: ProjectMemberTreeNode;
  projectLeadUserId: string | null | undefined;
}) {
  const label = node.displayName ?? node.email;
  const isProjectLead = projectLeadUserId && node.userId === projectLeadUserId;
  const rb = projectRoleBadge(node.role);

  return (
    <div className="flex flex-col items-center">
      <Card className="w-[220px] shrink-0 border-2 border-neutral-200 shadow-md transition-shadow hover:shadow-lg dark:border-neutral-700">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <User className="h-4 w-4 text-neutral-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant={rb.variant} className="px-1.5 py-0 text-[10px]">
                  {rb.label}
                </Badge>
                {isProjectLead && (
                  <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                    Project lead
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {node.children.length > 0 && (
        <>
          <div className="h-4 w-0.5 bg-neutral-300 dark:bg-neutral-600" />
          <div className="flex flex-wrap justify-center gap-8 pt-2">
            {node.children.map((child) => (
              <ProjectHierarchyNode key={child.userId} node={child} projectLeadUserId={projectLeadUserId} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectMemberChart({
  roots,
  projectLeadUserId,
}: {
  roots: ProjectMemberTreeNode[];
  projectLeadUserId: string | null | undefined;
}) {
  if (roots.length === 0) return null;
  return (
    <div className="overflow-x-auto py-4">
      <div className="flex min-w-max flex-wrap justify-center gap-8">
        {roots.map((node) => (
          <ProjectHierarchyNode key={node.userId} node={node} projectLeadUserId={projectLeadUserId} />
        ))}
      </div>
    </div>
  );
}

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
      })
      .catch(() => {
        setError("Failed to load project.");
        setProject(null);
      })
      .finally(() => setLoading(false));
  }, [status, api, id]);

  const memberRoots = useMemo(
    () => (project ? buildProjectAssignmentTree(project.assignedUsers) : []),
    [project]
  );
  const phases = project?.structure?.phases ?? [];

  const byUserId = useMemo(() => {
    const m = new Map<string, ProjectAssignmentOut>();
    if (!project) return m;
    for (const u of project.assignedUsers) m.set(u.userId, u);
    return m;
  }, [project]);

  const canViewMailboxThreads =
    project &&
    (!project.createdByUserId || !myUserId || project.createdByUserId === myUserId);

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
              {project.teamName ?? "No team"} · <span className="capitalize">{project.status}</span>
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
              <Link href="/admin/team-projects">
                <Button variant="outline" size="sm" type="button">
                  Edit on list
                </Button>
              </Link>
            </div>
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              Open <strong>Projects</strong> in the sidebar and click <strong>Edit</strong> on this project to set{" "}
              <strong>project lead</strong>, <strong>reports to on this project</strong>, roles, and assignments. This page
              does <strong>not</strong> use Admin → Workflow (org Manager/Member/team lead).
            </p>
          </div>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="h-5 w-5" />
                Phase workflow
              </CardTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Structure you defined for this project (comma-separated phases on the project form).
              </p>
            </CardHeader>
            <CardContent>
              {phases.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No phases yet. Add phases when editing the project (e.g. Discovery → Build → Launch).
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {phases.map((phase, i) => (
                    <Fragment key={`${phase}-${i}`}>
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
                        <span className="mr-2 text-xs font-normal text-indigo-600 dark:text-indigo-400">
                          Step {i + 1}
                        </span>
                        {phase}
                      </div>
                      {i < phases.length - 1 && (
                        <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
              {!!project.structure?.notes && (
                <p className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                  {project.structure.notes}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-5 w-5" />
                Project team (reporting on this project)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.assignedUsers.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No users assigned. Assign members on the project form to see the tree here.
                </p>
              ) : memberRoots.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Could not build hierarchy.</p>
              ) : (
                <ProjectMemberChart roots={memberRoots} projectLeadUserId={project.projectLeadUserId} />
              )}
              {project.assignedUsers.length > 0 && (
                <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {project.assignedUsers.map((u) => {
                    const reportsTo = u.reportsToUserId ? byUserId.get(u.reportsToUserId) : undefined;
                    return (
                      <li key={u.userId} className="space-y-1 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              {u.displayName ?? u.email}
                            </span>
                            {u.role?.trim() && (
                              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                                {u.role.trim()}
                              </span>
                            )}
                            {project.projectLeadUserId === u.userId && (
                              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                                Project lead
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            Reports to on project:{" "}
                            {reportsTo ? (reportsTo.displayName ?? reportsTo.email) : "—"}
                          </span>
                        </div>
                        {u.responsibilities && (
                          <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                            {u.responsibilities}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Mailbox &amp; threads</h2>
            {canViewMailboxThreads ? (
              <ProjectMailboxThreads projectId={project.id} projectName={project.name} />
            ) : (
              <Card className="rounded-2xl border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20">
                <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-100">
                  Related inbox/spam threads are only available to the admin who created this project. Open this project
                  while signed in as that account, or ask them to save the project once (Edit → Update) so the creator is
                  recorded.
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
