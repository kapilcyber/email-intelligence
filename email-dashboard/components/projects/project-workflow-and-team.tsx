"use client";

import { Fragment, useMemo, useState } from "react";
import type { TeamProjectOut, ProjectAssignmentOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, GitBranch, Network, User } from "lucide-react";

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
        const nextParent: string | null = raw.get(cur) ?? null;
        if (!nextParent || !idSet.has(nextParent)) break;
        cur = nextParent;
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
    <LenisScrollArea axis="horizontal" className="py-4" contentClassName="flex min-w-max flex-wrap justify-center gap-8">
      {roots.map((node) => (
        <ProjectHierarchyNode key={node.userId} node={node} projectLeadUserId={projectLeadUserId} />
      ))}
    </LenisScrollArea>
  );
}

/** Phase workflow + project reporting tree + assignee list. Pass `showPhaseWorkflow={false}` to hide the phase card (e.g. Temporary team page). */
export function ProjectWorkflowAndTeamSection({
  project,
  showPhaseWorkflow = true,
  teamSectionAsAccordion = false,
}: {
  project: TeamProjectOut;
  showPhaseWorkflow?: boolean;
  /** When true (e.g. Temporary team page), project team is in a collapsible panel. */
  teamSectionAsAccordion?: boolean;
}) {
  const [teamAccordionOpen, setTeamAccordionOpen] = useState(false);
  const memberRoots = useMemo(() => buildProjectAssignmentTree(project.assignedUsers), [project.assignedUsers]);
  const phases = project.structure?.phases ?? [];
  const byUserId = useMemo(() => {
    const m = new Map<string, ProjectAssignmentOut>();
    for (const u of project.assignedUsers) m.set(u.userId, u);
    return m;
  }, [project.assignedUsers]);

  const teamSectionBody = (
    <>
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
                    Reports to on project: {reportsTo ? (reportsTo.displayName ?? reportsTo.email) : "—"}
                  </span>
                </div>
                {u.responsibilities && (
                  <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{u.responsibilities}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return (
    <>
      {showPhaseWorkflow && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-5 w-5" />
              Phase workflow
            </CardTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Workflow steps from the project form (custom names or default Phase 1 … Phase 5). The status/phase selector
              stores which numbered phase the project is in.
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
                      <span className="mr-2 text-xs font-normal text-indigo-600 dark:text-indigo-400">Step {i + 1}</span>
                      {phase}
                    </div>
                    {i < phases.length - 1 && (
                      <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
                    )}
                  </Fragment>
                ))}
              </div>
            )}
            {typeof project.structure?.currentPhase === "number" && (
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Current phase:{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{project.structure.currentPhase}</span>
              </p>
            )}
            {!!project.structure?.notes && (
              <p className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                {project.structure.notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {teamSectionAsAccordion ? (
        <div className="glass-surface text-panel-foreground overflow-hidden rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setTeamAccordionOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-panel-elevated/50"
            aria-expanded={teamAccordionOpen}
            id={`project-team-trigger-${project.id}`}
          >
            <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <Network className="h-5 w-5 shrink-0" aria-hidden />
              <span className="truncate">Project team</span>
            </span>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                teamAccordionOpen && "rotate-180"
              )}
              aria-hidden
            />
          </button>
          {teamAccordionOpen && (
            <div
              className="border-t border-border px-4 pb-4 pt-2"
              role="region"
              aria-labelledby={`project-team-trigger-${project.id}`}
            >
              {teamSectionBody}
            </div>
          )}
        </div>
      ) : (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-5 w-5" />
              Project team
            </CardTitle>
          </CardHeader>
          <CardContent>{teamSectionBody}</CardContent>
        </Card>
      )}
    </>
  );
}
