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
import { User, LayoutGrid, List } from "lucide-react";

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

function HierarchyNode({ node }: { node: WorkflowTreeNode }) {
  const label = node.displayName ?? node.email;
  const roleVariant =
    node.role === "Admin" ? "error" : node.role === "Manager" ? "warning" : "secondary";

  return (
    <div className="flex flex-col items-center">
      <Card className="w-[200px] shrink-0 border-2 border-neutral-200 dark:border-neutral-700 shadow-md hover:shadow-lg transition-shadow">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <User className="h-4 w-4 text-neutral-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {label}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant={roleVariant} className="text-[10px] px-1.5 py-0">
                  {node.role}
                </Badge>
                {node.isTeamLead && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    Lead
                  </Badge>
                )}
              </div>
              {node.teamName && (
                <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {node.teamName}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {node.children.length > 0 && (
        <>
          <div className="h-4 w-0.5 bg-neutral-300 dark:bg-neutral-600" />
          <div className="flex gap-8 pt-2 flex-wrap justify-center">
            {node.children.map((child) => (
              <HierarchyNode key={child.id} node={child} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HierarchyChart({ roots }: { roots: WorkflowTreeNode[] }) {
  if (roots.length === 0) return null;
  return (
    <div className="overflow-x-auto py-4">
      <div className="flex flex-wrap gap-8 justify-center min-w-max">
        {roots.map((node) => (
          <HierarchyNode key={node.id} node={node} />
        ))}
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Hierarchy
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === "chart" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("chart")}
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Chart
          </Button>
          <Button
            variant={view === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("list")}
          >
            <List className="mr-2 h-4 w-4" />
            List
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <Card className="rounded-2xl">
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : nodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No users. Add users and assign managers to see the hierarchy.
            </p>
          ) : view === "chart" ? (
            <HierarchyChart roots={tree} />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {nodes.map((n) => (
                <li
                  key={n.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-neutral-500" />
                    <span className="font-medium text-neutral-900 dark:text-neutral-50">
                      {n.displayName ?? n.email}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {n.role}
                      {n.isTeamLead ? " · Team lead" : ""} · {n.teamName ?? "—"} · reports to{" "}
                      {getManagerName(n.managerId)}
                    </span>
                  </div>
                  <Select
                    value={n.managerId ?? ""}
                    onValueChange={(mid) => assignManager(n.id, mid)}
                    disabled={!!updatingId}
                  >
                    <SelectTrigger className="w-[200px]">
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
