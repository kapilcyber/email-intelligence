"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { TeamProjectOut, WorkflowNode, WorkflowTreeNode } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronRight, GitBranch, Network, User } from "lucide-react";

/** Reporting tree limited to users assigned to this project (edges only when manager is also on project). */
function buildProjectMemberTree(assignedUserIds: string[], allNodes: WorkflowNode[]): WorkflowTreeNode[] {
  const idSet = new Set(assignedUserIds);
  const nodes = allNodes.filter((n) => idSet.has(n.id));
  const byId = new Map<string, WorkflowTreeNode>();
  for (const n of nodes) {
    byId.set(n.id, { ...n, children: [] });
  }
  const roots: WorkflowTreeNode[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id)!;
    const mgrInProject = n.managerId && idSet.has(n.managerId);
    const parent = mgrInProject ? byId.get(n.managerId!) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function HierarchyNode({ node }: { node: WorkflowTreeNode }) {
  const label = node.displayName ?? node.email;
  const roleVariant =
    node.role === "Admin" ? "error" : node.role === "Manager" ? "warning" : "secondary";

  return (
    <div className="flex flex-col items-center">
      <Card className="w-[200px] shrink-0 border-2 border-neutral-200 shadow-md transition-shadow hover:shadow-lg dark:border-neutral-700">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <User className="h-4 w-4 text-neutral-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant={roleVariant} className="px-1.5 py-0 text-[10px]">
                  {node.role}
                </Badge>
                {node.isTeamLead && (
                  <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                    Lead
                  </Badge>
                )}
              </div>
              {node.teamName && (
                <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{node.teamName}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {node.children.length > 0 && (
        <>
          <div className="h-4 w-0.5 bg-neutral-300 dark:bg-neutral-600" />
          <div className="flex flex-wrap justify-center gap-8 pt-2">
            {node.children.map((child) => (
              <HierarchyNode key={child.id} node={child} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemberWorkflowChart({ roots }: { roots: WorkflowTreeNode[] }) {
  if (roots.length === 0) return null;
  return (
    <div className="overflow-x-auto py-4">
      <div className="flex min-w-max flex-wrap justify-center gap-8">
        {roots.map((node) => (
          <HierarchyNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

export default function AdminProjectWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [project, setProject] = useState<TeamProjectOut | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !id) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getProjectWorkflow(id), api.getWorkflow()])
      .then(([p, w]) => {
        setProject(p);
        setWorkflowNodes(w);
      })
      .catch(() => {
        setError("Failed to load project or workflow.");
        setProject(null);
      })
      .finally(() => setLoading(false));
  }, [status, api, id]);

  const assignedIds = useMemo(() => project?.assignedUsers.map((u) => u.userId) ?? [], [project]);
  const memberRoots = useMemo(
    () => buildProjectMemberTree(assignedIds, workflowNodes),
    [assignedIds, workflowNodes]
  );
  const phases = project?.structure?.phases ?? [];

  if (!id) {
    return (
      <div className="p-6 text-sm text-neutral-500">
        Invalid project.
        <Button variant="link" onClick={() => router.push("/admin/team-projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/team-projects">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            All projects
          </Button>
        </Link>
      </div>

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
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{project.name}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {project.teamName ?? "No team"} · <span className="capitalize">{project.status}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/team-projects">
                <Button variant="outline" size="sm" type="button">
                  Edit on list
                </Button>
              </Link>
            </div>
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              Open <strong>Projects</strong> in the sidebar and click <strong>Edit</strong> on this project to change phases,
              notes, or assignments.
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
                Team workflow (reporting)
              </CardTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Assigned people and how they report to each other within this project (same hierarchy style as Admin →
                Workflow).
              </p>
            </CardHeader>
            <CardContent>
              {assignedIds.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No users assigned. Assign members on the project form to see their reporting tree here.
                </p>
              ) : memberRoots.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Could not build hierarchy.</p>
              ) : (
                <MemberWorkflowChart roots={memberRoots} />
              )}
              {project.assignedUsers.length > 0 && (
                <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {project.assignedUsers.map((u) => {
                    const node = workflowNodes.find((n) => n.id === u.userId);
                    const mgr =
                      node?.managerId && workflowNodes.find((x) => x.id === node.managerId);
                    return (
                      <li key={u.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {u.displayName ?? u.email}
                        </span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          Reports to:{" "}
                          {mgr ? (mgr.displayName ?? mgr.email) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
