"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { UserOut, TeamOut, TeamProjectOut } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FolderKanban, ChevronRight } from "lucide-react";

/** How the project role is chosen in the form (stored as TL, Manager, or free text). */
type ProjectRoleKind = "tl" | "manager" | "custom";

function parseStoredProjectRole(role: string | null | undefined): { roleKind: ProjectRoleKind; customRole: string } {
  const r = (role ?? "").trim();
  if (!r) return { roleKind: "custom", customRole: "" };
  const lower = r.toLowerCase();
  if (r === "TL" || lower === "team lead" || lower === "tl") return { roleKind: "tl", customRole: "" };
  if (r === "Manager" || lower === "manager") return { roleKind: "manager", customRole: "" };
  return { roleKind: "custom", customRole: r };
}

function memberRowToApiRole(m: {
  roleKind: ProjectRoleKind;
  customRole: string;
}): string | null {
  if (m.roleKind === "tl") return "TL";
  if (m.roleKind === "manager") return "Manager";
  const t = m.customRole.trim();
  return t || null;
}

export default function AdminTeamProjectsPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [users, setUsers] = useState<UserOut[]>([]);
  const [teams, setTeams] = useState<TeamOut[]>([]);
  const [projects, setProjects] = useState<TeamProjectOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectStatus, setProjectStatus] = useState<"running" | "new" | "planned" | "completed">("running");
  const [projectTeamId, setProjectTeamId] = useState<string>("");
  const [projectPhases, setProjectPhases] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  /** Users included on this project */
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  /** Per-user: TL/Manager/custom role, responsibilities, project-only reporting */
  const [memberDetails, setMemberDetails] = useState<
    Record<string, { roleKind: ProjectRoleKind; customRole: string; responsibilities: string; reportsToUserId: string }>
  >({});
  /** Project lead (optional); separate from org team lead / Admin workflow. */
  const [projectLeadUserId, setProjectLeadUserId] = useState<string>("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);

  const load = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    Promise.all([api.getUsers(), api.getTeams()])
      .then(([u, t]) => {
        setUsers(u);
        setTeams(t);
        return api.getProjectsWorkflow();
      })
      .then((p) => {
        setProjects(p);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load data";
        setError(msg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status, api]);

  const resetProjectForm = () => {
    setEditingProjectId(null);
    setProjectName("");
    setProjectStatus("running");
    setProjectTeamId("");
    setProjectPhases("");
    setProjectNotes("");
    setSelectedMemberIds([]);
    setMemberDetails({});
    setProjectLeadUserId("");
  };

  const defaultMemberRow = () => ({
    roleKind: "custom" as ProjectRoleKind,
    customRole: "",
    responsibilities: "",
    reportsToUserId: "",
  });

  const toggleMember = (userId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(userId)) {
        setProjectLeadUserId((lead) => (lead === userId ? "" : lead));
        setMemberDetails((d) => {
          const next = { ...d };
          delete next[userId];
          for (const k of Object.keys(next)) {
            if (next[k].reportsToUserId === userId) {
              next[k] = { ...next[k], reportsToUserId: "" };
            }
          }
          return next;
        });
        return prev.filter((x) => x !== userId);
      }
      setMemberDetails((d) => ({
        ...d,
        [userId]: d[userId] ?? defaultMemberRow(),
      }));
      return [...prev, userId];
    });
  };

  const setMemberField = (
    userId: string,
    field: "roleKind" | "customRole" | "responsibilities" | "reportsToUserId",
    value: string | ProjectRoleKind
  ) => {
    setMemberDetails((d) => ({
      ...d,
      [userId]: { ...(d[userId] ?? defaultMemberRow()), [field]: value },
    }));
  };

  const saveProject = () => {
    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }
    setSavingProject(true);
    setError(null);
    const body = {
      name: projectName.trim(),
      status: projectStatus,
      teamId: projectTeamId || null,
      structure: {
        phases: projectPhases
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        notes: projectNotes.trim() || undefined,
      },
      projectLeadUserId: projectLeadUserId.trim() || null,
      assignments: selectedMemberIds.map((userId) => {
        const m = memberDetails[userId] ?? defaultMemberRow();
        return {
          userId,
          role: memberRowToApiRole(m),
          responsibilities: m.responsibilities.trim() || null,
          reportsToUserId: m.reportsToUserId.trim() || null,
        };
      }),
    };
    const req = editingProjectId
      ? api.updateProjectWorkflow(editingProjectId, body)
      : api.createProjectWorkflow(body);
    req
      .then(() => {
        resetProjectForm();
        return api.getProjectsWorkflow();
      })
      .then((p) => setProjects(p))
      .catch(() => setError("Failed to save project"))
      .finally(() => setSavingProject(false));
  };

  const editProject = (p: TeamProjectOut) => {
    setEditingProjectId(p.id);
    setProjectName(p.name);
    setProjectStatus(p.status);
    setProjectTeamId(p.teamId ?? "");
    setProjectPhases((p.structure?.phases ?? []).join(", "));
    setProjectNotes(p.structure?.notes ?? "");
    setSelectedMemberIds(p.assignedUsers.map((u) => u.userId));
    setMemberDetails(
      Object.fromEntries(
        p.assignedUsers.map((u) => {
          const parsed = parseStoredProjectRole(u.role);
          return [
            u.userId,
            {
              roleKind: parsed.roleKind,
              customRole: parsed.customRole,
              responsibilities: u.responsibilities ?? "",
              reportsToUserId: u.reportsToUserId ?? "",
            },
          ];
        })
      )
    );
    setProjectLeadUserId(p.projectLeadUserId ?? "");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <FolderKanban className="h-6 w-6" />
          Projects
        </h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">{editingProjectId ? "Edit project" : "Create project"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={projectStatus}
                onValueChange={(v) => setProjectStatus(v as "running" | "new" | "planned" | "completed")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={projectTeamId || "__none__"}
                onValueChange={(v) => setProjectTeamId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              value={projectPhases}
              onChange={(e) => setProjectPhases(e.target.value)}
              placeholder="Phases (comma separated)"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <textarea
              value={projectNotes}
              onChange={(e) => setProjectNotes(e.target.value)}
              placeholder="Project structure notes / workflow details"
              rows={4}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Team members on this project</p>
            <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Set the <strong>reporting tree</strong> per person with <strong>Reports to on this project</strong>. That
              drives the workflow chart for this project only.
            </p>
            <div className="space-y-2">
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Optional: choose one <strong>project lead</strong> (only from people assigned below).
              </p>
              <Select
                value={projectLeadUserId || "__none__"}
                onValueChange={(v) => setProjectLeadUserId(v === "__none__" ? "" : v)}
                disabled={selectedMemberIds.length === 0}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="No project lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project lead</SelectItem>
                  {selectedMemberIds.map((id) => {
                    const u = users.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <SelectItem key={id} value={id}>
                        {u.displayName ?? u.email}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
              {users.map((u) => {
                const on = selectedMemberIds.includes(u.id);
                const det = memberDetails[u.id] ?? defaultMemberRow();
                const reportOptions = selectedMemberIds.filter((id) => id !== u.id);
                return (
                  <div key={u.id} className="rounded-md border border-neutral-100 p-2 dark:border-neutral-800">
                    <label className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={on} onChange={() => toggleMember(u.id)} />
                      <span>{u.displayName ?? u.email}</span>
                      <span className="text-[10px] font-normal text-neutral-400" title="Org role (Admin → Workflow), not used on this project chart">
                        Org: {u.role}
                      </span>
                    </label>
                    {on && (
                      <div className="mt-2 space-y-2 pl-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-neutral-500">Role on this project</p>
                          <Select
                            value={det.roleKind}
                            onValueChange={(v) => setMemberField(u.id, "roleKind", v as ProjectRoleKind)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tl">Team Lead (TL)</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="custom">Other (type below)</SelectItem>
                            </SelectContent>
                          </Select>
                          {det.roleKind === "custom" && (
                            <input
                              value={det.customRole}
                              onChange={(e) => setMemberField(u.id, "customRole", e.target.value)}
                              placeholder="e.g. Developer, QA, Analyst…"
                              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-900"
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-neutral-500">Reports to on this project</p>
                          <Select
                            value={det.reportsToUserId || "__none__"}
                            onValueChange={(v) => setMemberField(u.id, "reportsToUserId", v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Nobody" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nobody (flat)</SelectItem>
                              {reportOptions.map((oid) => {
                                const ou = users.find((x) => x.id === oid);
                                if (!ou) return null;
                                return (
                                  <SelectItem key={oid} value={oid}>
                                    {ou.displayName ?? ou.email}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <textarea
                          value={det.responsibilities}
                          onChange={(e) => setMemberField(u.id, "responsibilities", e.target.value)}
                          placeholder="What they do on this project…"
                          rows={2}
                          className="w-full resize-y rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-600 dark:bg-neutral-900"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button onClick={saveProject} disabled={savingProject}>
                {savingProject ? "Saving..." : editingProjectId ? "Update project" : "Create project"}
              </Button>
              {editingProjectId && (
                <Button variant="outline" onClick={resetProjectForm}>
                  Cancel edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">All projects</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : projects.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No projects yet. Create one from the panel.
              </p>
            ) : (
              <div className="space-y-3">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <Link
                      href={`/admin/team-projects/${p.id}`}
                      className="block p-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {p.teamName ?? "No team"} · {p.status}
                          </p>
                          {(p.structure?.phases?.length ?? 0) > 0 && (
                            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                              Phases: {p.structure?.phases?.join(" → ")}
                            </p>
                          )}
                          {!!p.structure?.notes && (
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                              {p.structure.notes}
                            </p>
                          )}
                          {p.projectLeadUserId && (
                            <p className="mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                              Project lead:{" "}
                              {p.assignedUsers.find((x) => x.userId === p.projectLeadUserId)?.displayName ??
                                p.assignedUsers.find((x) => x.userId === p.projectLeadUserId)?.email ??
                                p.projectLeadUserId}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                            Assigned:{" "}
                            {p.assignedUsers.length === 0
                              ? "None"
                              : p.assignedUsers
                                  .map((u) => {
                                    const bits = [u.displayName ?? u.email];
                                    if (u.role) bits.push(u.role);
                                    return bits.join(" — ");
                                  })
                                  .join(" · ")}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          Workflow
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>
                    <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={() => editProject(p)}
                      >
                        Edit in sidebar form
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
