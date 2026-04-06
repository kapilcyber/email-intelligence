"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { WorkflowNode, WorkflowTreeNode, UserOut } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Building2, ChevronDown, FolderKanban, LayoutGrid, List } from "lucide-react";

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts[0]?.length) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function roleBadgeVariant(role: string): "error" | "warning" | "secondary" {
  if (role === "Admin") return "error";
  if (role === "Manager") return "warning";
  return "secondary";
}

function buildTree(nodes: WorkflowNode[]): WorkflowTreeNode[] {
  const byId = new Map<string, WorkflowTreeNode>();
  for (const n of nodes) {
    byId.set(n.id, { ...n, children: [] });
  }
  const roots: WorkflowTreeNode[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id)!;
    if (!n.managerId) {
      roots.push(node);
    } else {
      const parent = byId.get(n.managerId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

/** Branch-style list shown under a member card when expanded. */
function MemberProjectsTree({ names }: { names: string[] }) {
  if (names.length === 0) {
    return (
      <div
        className={cn(
          "mt-3 overflow-hidden rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2.5",
          "animate-in slide-in-from-top-1 fade-in duration-200 motion-reduce:animate-none"
        )}
      >
        <p className="flex items-center gap-1.5 text-[11px] italic text-muted-foreground">
          <FolderKanban className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          No team projects assigned.
        </p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-lg border border-indigo-200/55 bg-gradient-to-b from-indigo-50/90 to-panel/95 p-3 shadow-inner",
        "dark:border-indigo-500/30 dark:from-indigo-950/35 dark:to-panel/95",
        "animate-in slide-in-from-top-2 fade-in duration-200 motion-reduce:animate-none"
      )}
      role="region"
      aria-label="Projects for this member"
    >
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-800/90 dark:text-indigo-200/90">
        <FolderKanban className="h-3.5 w-3.5 opacity-80" aria-hidden />
        Team projects
      </p>
      <ul className="ml-1 space-y-0.5 border-l-2 border-indigo-300/55 py-0.5 pl-3 dark:border-indigo-500/40" role="list">
        {names.map((name, i) => (
          <li
            key={`${name}-${i}`}
            className="relative py-1 pl-3 text-[11px] before:absolute before:left-0 before:top-[0.62rem] before:h-px before:w-2.5 before:-translate-x-3 before:bg-indigo-400/75 before:content-[''] dark:before:bg-indigo-400/50"
          >
            <span className="break-words font-medium leading-snug text-foreground">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkflowMemberChartCard({
  node,
  animIndex,
}: {
  node: WorkflowTreeNode;
  animIndex: number;
}) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const label = node.displayName ?? node.email;
  const initials = getInitials(label);
  const roleVariant = roleBadgeVariant(node.role);
  const projectNames = node.projectNames ?? [];
  const projectCount = projectNames.length;

  return (
    <Card
      className={cn(
        "w-[min(220px,85vw)] shrink-0 overflow-hidden border border-border/80 bg-gradient-to-b from-panel-elevated/90 to-panel/80 shadow-md",
        "transition-all duration-300 ease-out motion-reduce:transition-none",
        "hover:z-10 hover:scale-[1.02] hover:border-indigo-300/60 hover:shadow-lg hover:shadow-indigo-500/10",
        "dark:hover:border-indigo-500/40 dark:hover:shadow-indigo-950/40",
        "animate-in fade-in zoom-in-95 fill-mode-both motion-reduce:animate-none",
        projectsOpen && "ring-2 ring-indigo-400/35 dark:ring-indigo-500/30"
      )}
      style={{ animationDelay: `${animIndex * 45}ms`, animationDuration: "400ms" }}
    >
      <CardContent className="p-3.5">
        <button
          type="button"
          className={cn(
            "w-full rounded-lg text-left outline-none transition-colors",
            "hover:bg-panel-elevated/40 focus-visible:ring-2 focus-visible:ring-indigo-400/50 dark:focus-visible:ring-indigo-500/40",
            "-m-1 p-1"
          )}
          onClick={() => setProjectsOpen((o) => !o)}
          aria-expanded={projectsOpen}
          aria-controls={`member-projects-${node.id}`}
          id={`member-trigger-${node.id}`}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-inner",
                "bg-gradient-to-br from-indigo-500 to-violet-600 ring-2 ring-white/30 dark:ring-white/10"
              )}
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-1">
                <p className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-tight text-foreground">
                  {label}
                </p>
                <ChevronDown
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                    projectsOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <Badge variant={roleVariant} className="px-1.5 py-0 text-[10px] font-semibold">
                  {node.role}
                </Badge>
                {node.isTeamLead && (
                  <Badge variant="success" className="px-1.5 py-0 text-[10px] font-semibold">
                    Team lead
                  </Badge>
                )}
              </div>
              {node.teamName && (
                <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
                  <Building2 className="mt-0.5 h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 break-words">{node.teamName}</span>
                </p>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">
                {projectCount === 0
                  ? "Click to view projects"
                  : projectsOpen
                    ? "Click to hide projects"
                    : `Click for ${projectCount} project${projectCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </button>
        {projectsOpen && (
          <div id={`member-projects-${node.id}`} className="border-t border-border/40 pt-1">
            <MemberProjectsTree names={projectNames} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Left-to-right org chart: parent → connector → stacked subtrees (reads like a classic horizontal hierarchy). */
function HorizontalHierarchyBranch({
  node,
  animIndex = 0,
  childIndex = 0,
}: {
  node: WorkflowTreeNode;
  animIndex?: number;
  childIndex?: number;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex min-w-0 flex-row items-stretch">
      <div className="flex shrink-0 flex-col justify-center">
        <WorkflowMemberChartCard node={node} animIndex={animIndex + childIndex} />
      </div>
      {hasChildren && (
        <div className="flex min-w-0 flex-row items-stretch">
          <div className="flex w-7 shrink-0 flex-col justify-center sm:w-9" aria-hidden>
            <div
              className={cn(
                "h-px w-full bg-gradient-to-r from-border via-indigo-400/40 to-border",
                "animate-in fade-in slide-in-from-left-2 motion-reduce:animate-none dark:via-indigo-500/35"
              )}
              style={{ animationDelay: `${animIndex * 45 + 80}ms` }}
            />
          </div>
          <div
            className={cn(
              "relative flex flex-col justify-center gap-4 border-l-2 border-indigo-200/70 py-3 pl-4 dark:border-indigo-500/35",
              "animate-in fade-in motion-reduce:animate-none"
            )}
            style={{ animationDelay: `${animIndex * 45 + 100}ms` }}
          >
            {node.children.map((child, i) => (
              <div key={child.id} className="relative flex flex-row items-center">
                <div
                  className="absolute -left-4 top-1/2 h-px w-4 -translate-y-1/2 bg-indigo-200/80 dark:bg-indigo-500/40"
                  aria-hidden
                />
                <HorizontalHierarchyBranch node={child} animIndex={animIndex + i + 1} childIndex={i} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HierarchyChart({ roots }: { roots: WorkflowTreeNode[] }) {
  if (roots.length === 0) return null;
  return (
    <div className="max-w-full min-w-0 overflow-x-auto overflow-y-visible rounded-xl border border-border/50 py-2 [-webkit-overflow-scrolling:touch] sm:border-transparent sm:py-2">
      <p className="mb-2 px-1 text-[11px] text-muted-foreground sm:hidden">Swipe horizontally to see the full chart.</p>
      <div className="inline-block min-w-min px-1 pb-2 pt-1 sm:pt-2">
        <div className="flex flex-col gap-8 sm:gap-10">
          {roots.map((node, i) => (
            <HorizontalHierarchyBranch key={node.id} node={node} animIndex={i} childIndex={0} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminWorkflowPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "list">("chart");

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    Promise.all([api.getWorkflow(), api.getUsers()])
      .then(([n, u]) => {
        setNodes(n);
        setUsers(u);
      })
      .catch(() => setError("Failed to load workflow"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api]);

  const assignManager = (userId: string, managerId: string) => {
    setUpdatingId(userId);
    api
      .updateUser(userId, { managerId: managerId })
      .then(() => load())
      .catch(() => setError("Failed to update"))
      .finally(() => setUpdatingId(null));
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return "—";
    const m = nodes.find((n) => n.id === managerId);
    return m ? (m.displayName ?? m.email) : managerId;
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
            Hierarchy
          </h1>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
            Org chart and manager assignments (chart scrolls sideways on small screens).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:gap-2">
          <Button
            type="button"
            variant={view === "chart" ? "default" : "outline"}
            size="sm"
            className="h-10 w-full sm:h-9 sm:w-auto"
            onClick={() => setView("chart")}
          >
            <LayoutGrid className="mr-2 h-4 w-4 shrink-0" />
            Chart
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "default" : "outline"}
            size="sm"
            className="h-10 w-full sm:h-9 sm:w-auto"
            onClick={() => setView("list")}
          >
            <List className="mr-2 h-4 w-4 shrink-0" />
            List
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border-border/60 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl sm:h-20" />
              <Skeleton className="h-16 w-full rounded-xl sm:h-20" />
              <Skeleton className="h-16 w-full rounded-xl sm:h-20" />
            </div>
          ) : nodes.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No users. Add users and assign managers to see the hierarchy.
            </p>
          ) : view === "chart" ? (
            <HierarchyChart roots={tree} />
          ) : (
            <ul className="flex min-w-0 flex-col gap-3">
              {nodes.map((n, i) => {
                const label = n.displayName ?? n.email;
                const initials = getInitials(label);
                const rv = roleBadgeVariant(n.role);
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "min-w-0 animate-in fade-in slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none"
                    )}
                    style={{ animationDelay: `${i * 45}ms`, animationDuration: "380ms" }}
                  >
                    <div
                      className={cn(
                        "group flex min-w-0 flex-col gap-4 rounded-xl border border-border/60 bg-panel/40 p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
                        "transition-all duration-200 ease-out motion-reduce:transition-none",
                        "hover:border-indigo-300/50 hover:bg-panel-elevated/50 hover:shadow-md",
                        "dark:hover:border-indigo-500/35"
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                            "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md ring-2 ring-white/25 dark:ring-white/10",
                            "transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                          )}
                          aria-hidden
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-words font-semibold text-foreground">{label}</span>
                            <Badge variant={rv} className="text-[10px] font-semibold">
                              {n.role}
                            </Badge>
                            {n.isTeamLead && (
                              <Badge variant="success" className="text-[10px] font-semibold">
                                Team lead
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                            <span className="inline-flex w-fit max-w-full items-center gap-1 rounded-md bg-muted/80 px-2 py-1 font-medium text-foreground/80">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                              <span className="break-words">{n.teamName ?? "No team"}</span>
                            </span>
                            <span className="inline-flex max-w-full items-start gap-1 rounded-md bg-muted/50 px-2 py-1">
                              <FolderKanban className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                              <span className="min-w-0 break-words text-foreground/85">
                                {(n.projectNames ?? []).length > 0
                                  ? (n.projectNames ?? []).join(" · ")
                                  : "No team projects"}
                              </span>
                            </span>
                            <span className="break-words">
                              Reports to{" "}
                              <span className="font-medium text-foreground">{getManagerName(n.managerId)}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full shrink-0 border-t border-border/50 pt-3 sm:w-[220px] sm:border-t-0 sm:pt-0">
                        <Select
                          value={n.managerId ?? ""}
                          onValueChange={(mid) => assignManager(n.id, mid)}
                          disabled={!!updatingId}
                        >
                          <SelectTrigger className="h-10 w-full min-w-0 rounded-lg transition-colors hover:bg-panel-elevated">
                            <SelectValue placeholder="Assign manager" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No manager</SelectItem>
                            {users
                              .filter((x) => x.id !== n.id)
                              .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.displayName ?? u.email}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
