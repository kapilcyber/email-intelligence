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
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { DEPARTMENT_CATEGORIES } from "@/lib/departments";

const PROJECT_STATUS_OPTS = ["new", "planned", "running", "completed"] as const;
type ProjectFormStatus = (typeof PROJECT_STATUS_OPTS)[number];

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_PHASE_OPTIONS: { value: string; label: string }[] = [
  ...PROJECT_STATUS_OPTS.map((st) => ({ value: `status:${st}`, label: statusLabel(st) })),
  ...Array.from({ length: 5 }, (_, i) => ({ value: `phase:${i + 1}`, label: `Phase ${i + 1}` })),
];

function defaultWorkflowPhases(): string[] {
  return Array.from({ length: 5 }, (_, i) => `Phase ${i + 1}`);
}


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
  const [projectStatus, setProjectStatus] = useState<ProjectFormStatus>("running");
  const [projectPhase, setProjectPhase] = useState<number>(1);
  /** Flat selector state: `status:<value>` or `phase:<1..5>`. */
  const [statusPhaseValue, setStatusPhaseValue] = useState("status:running");
  const [projectTeamId, setProjectTeamId] = useState<string>("");
  /** Department name: empty = all users; must match `User.teamName`. */
  const [selectedDepartment, setSelectedDepartment] = useState("");
  /** Custom workflow step names (comma-separated). If empty, uses Phase 1 … Phase 5. */
  const [customPhaseNames, setCustomPhaseNames] = useState("");
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

  useEffect(() => {
    if (statusPhaseValue.startsWith("status:")) {
      const raw = statusPhaseValue.slice("status:".length) as ProjectFormStatus;
      if (PROJECT_STATUS_OPTS.includes(raw)) setProjectStatus(raw);
      return;
    }
    if (statusPhaseValue.startsWith("phase:")) {
      const n = parseInt(statusPhaseValue.slice("phase:".length), 10);
      if (Number.isFinite(n)) setProjectPhase(Math.min(5, Math.max(1, n)));
    }
  }, [statusPhaseValue]);

  /** All department/team names to pick from (app departments + DB teams). */
  const departmentOptions = useMemo(() => {
    const s = new Set<string>([...DEPARTMENT_CATEGORIES]);
    teams.forEach((t) => {
      if (t.name?.trim()) s.add(t.name.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [teams]);

  const filteredUsers = useMemo(() => {
    if (!selectedDepartment) return users;
    return users.filter((u) => (u.teamName ?? "").trim() === selectedDepartment);
  }, [users, selectedDepartment]);
  const activeProjects = useMemo(
    () => projects.filter((p) => (p.status ?? "").toLowerCase() !== "completed"),
    [projects]
  );

  useEffect(() => {
    if (!selectedDepartment) {
      setProjectTeamId("");
      return;
    }
    const team = teams.find((t) => t.name.trim() === selectedDepartment);
    setProjectTeamId(team?.id ?? "");
  }, [selectedDepartment, teams]);

  const resetProjectForm = () => {
    setEditingProjectId(null);
    setProjectName("");
    setProjectStatus("running");
    setProjectPhase(1);
    setStatusPhaseValue("status:running");
    setProjectTeamId("");
    setSelectedDepartment("");
    setCustomPhaseNames("");
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
    const customList = customPhaseNames
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const phases = customList.length > 0 ? customList : defaultWorkflowPhases();
    const body = {
      name: projectName.trim(),
      status: projectStatus,
      teamId: projectTeamId || null,
      structure: {
        phases,
        currentPhase: projectPhase,
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
    const ph = p.structure?.currentPhase;
    const phaseNum =
      typeof ph === "number" && Number.isFinite(ph) ? Math.min(5, Math.max(1, ph)) : 1;
    const st = PROJECT_STATUS_OPTS.includes(p.status as ProjectFormStatus)
      ? p.status
      : "running";
    setProjectStatus(st as ProjectFormStatus);
    setProjectPhase(phaseNum);
    setStatusPhaseValue(`status:${st}`);
    setSelectedDepartment((p.teamName ?? "").trim());
    setProjectTeamId(p.teamId ?? "");
    const savedPhases = p.structure?.phases ?? [];
    const isDefault =
      savedPhases.length === 5 && savedPhases.every((name, i) => name === `Phase ${i + 1}`);
    setCustomPhaseNames(isDefault ? "" : savedPhases.join(", "));
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

  const fieldClass =
    "w-full min-w-0 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-foreground shadow-sm " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">Projects</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p className="break-words">{error}</p>
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base leading-snug">
              {editingProjectId ? "Edit project" : "Create project"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className={cn(fieldClass, "h-10")}
            />
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Status &amp; phase</p>
              <Select value={statusPhaseValue} onValueChange={setStatusPhaseValue}>
                <SelectTrigger className="h-10 w-full min-w-0">
                  <SelectValue placeholder="Status and phase" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_PHASE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Department</p>
              <Select
                value={selectedDepartment || "__all__"}
                onValueChange={(v) => setSelectedDepartment(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All departments</SelectItem>
                  {departmentOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-xs text-neutral-700 dark:text-neutral-300">
                <p className="font-medium">Selected members</p>
                {selectedMemberIds.length === 0 ? (
                  <p className="mt-1 text-neutral-500 dark:text-neutral-400">No members selected yet.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedMemberIds.map((id) => {
                      const u = users.find((x) => x.id === id);
                      if (!u) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[11px]"
                        >
                          <span className="min-w-0 truncate">{u.displayName ?? u.email}</span>
                          <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                            ({u.teamName ?? "No department"})
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Custom phase names (optional)</p>
              <textarea
                value={customPhaseNames}
                onChange={(e) => setCustomPhaseNames(e.target.value)}
                placeholder="e.g. Discovery, Design, Build, Test, Launch - comma-separated. Leave empty to use Phase 1 … Phase 5 for the workflow."
                rows={3}
                className={cn(fieldClass, "min-h-[4.5rem] resize-y")}
              />
            </div>
            <textarea
              value={projectNotes}
              onChange={(e) => setProjectNotes(e.target.value)}
              placeholder="Project structure notes / workflow details"
              rows={4}
              className={cn(fieldClass, "min-h-[6rem] resize-y")}
            />
            <div className="space-y-2">
              <Select
                value={projectLeadUserId || "__none__"}
                onValueChange={(v) => setProjectLeadUserId(v === "__none__" ? "" : v)}
                disabled={selectedMemberIds.length === 0}
              >
                <SelectTrigger className="h-10 w-full min-w-0 text-xs">
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
            <LenisScrollArea
              className="max-h-72 min-h-0 w-full min-w-0 rounded-lg border border-border sm:max-h-80"
              contentClassName="space-y-3 p-2"
            >
              {filteredUsers.map((u) => {
                const on = selectedMemberIds.includes(u.id);
                const det = memberDetails[u.id] ?? defaultMemberRow();
                const reportOptions = selectedMemberIds.filter((id) => id !== u.id);
                return (
                  <div key={u.id} className="min-w-0 rounded-lg border border-border p-2">
                    <label className="flex cursor-pointer flex-col gap-2 text-sm font-medium sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
                      <span className="flex shrink-0 items-center gap-2">
                        <input type="checkbox" className="shrink-0" checked={on} onChange={() => toggleMember(u.id)} />
                        <span className="min-w-0 break-words">{u.displayName ?? u.email}</span>
                      </span>
                      <span
                        className="text-[10px] font-normal leading-snug text-neutral-500 dark:text-neutral-400 sm:ml-0"
                        title="Org role (Admin → Workflow), not used on this project chart"
                      >
                        {u.teamName ? `${u.teamName} · ` : ""}Org: {u.role}
                      </span>
                    </label>
                    {on && (
                      <div className="mt-2 space-y-2 border-t border-border/60 pt-2 pl-0 sm:pl-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-neutral-500">Role on this project</p>
                          <Select
                            value={det.roleKind}
                            onValueChange={(v) => setMemberField(u.id, "roleKind", v as ProjectRoleKind)}
                          >
                            <SelectTrigger className="h-9 w-full min-w-0 text-xs">
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
                              className={cn(fieldClass, "mt-1 h-9 px-2 py-1.5 text-xs")}
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-neutral-500">Reports to on this project</p>
                          <Select
                            value={det.reportsToUserId || "__none__"}
                            onValueChange={(v) => setMemberField(u.id, "reportsToUserId", v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className="h-9 w-full min-w-0 text-xs">
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
                          className={cn(fieldClass, "min-h-[3.25rem] resize-y px-2 py-1.5 text-xs")}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </LenisScrollArea>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" className="h-10 w-full sm:h-9 sm:w-auto" onClick={saveProject} disabled={savingProject}>
                {savingProject ? "Saving..." : editingProjectId ? "Update project" : "Create project"}
              </Button>
              {editingProjectId && (
                <Button type="button" variant="outline" className="h-10 w-full sm:h-9 sm:w-auto" onClick={resetProjectForm}>
                  Cancel edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border-border">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base">Active projects</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <Skeleton className="h-40 w-full rounded-lg sm:h-48" />
            ) : activeProjects.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No projects yet. Create one from the panel.
              </p>
            ) : (
              <div className="space-y-3">
                {activeProjects.map((p) => (
                  <div key={p.id} className="min-w-0 overflow-hidden rounded-lg border border-border">
                    <Link
                      href={`/admin/team-projects/${p.id}`}
                      className="block p-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                          <p className="mt-0.5 break-words text-xs text-neutral-500 dark:text-neutral-400">
                            {p.teamName ?? "No department"} · {p.status}
                            {typeof p.structure?.currentPhase === "number"
                              ? ` · Phase ${p.structure.currentPhase}`
                              : ""}
                          </p>
                          {(p.structure?.phases?.length ?? 0) > 0 && (
                            <p className="mt-2 break-words text-xs text-neutral-500 dark:text-neutral-400">
                              Phases: {p.structure?.phases?.join(" → ")}
                            </p>
                          )}
                          {!!p.structure?.notes && (
                            <p className="mt-1 line-clamp-3 text-xs text-neutral-500 dark:text-neutral-400 sm:line-clamp-2">
                              {p.structure.notes}
                            </p>
                          )}
                          {p.projectLeadUserId && (
                            <p className="mt-2 break-words text-xs font-medium text-indigo-700 dark:text-indigo-300">
                              Project lead:{" "}
                              {p.assignedUsers.find((x) => x.userId === p.projectLeadUserId)?.displayName ??
                                p.assignedUsers.find((x) => x.userId === p.projectLeadUserId)?.email ??
                                p.projectLeadUserId}
                            </p>
                          )}
                          <p className="mt-2 line-clamp-4 break-words text-xs leading-relaxed text-neutral-600 dark:text-neutral-300 sm:line-clamp-none">
                            Assigned:{" "}
                            {p.assignedUsers.length === 0
                              ? "None"
                              : p.assignedUsers
                                .map((u) => {
                                  const bits = [u.displayName ?? u.email];
                                  if (u.role) bits.push(u.role);
                                  return bits.join(" - ");
                                })
                                .join(" · ")}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center justify-end gap-1 self-end text-xs font-medium text-indigo-600 dark:text-indigo-400 sm:self-start sm:justify-start">
                          Workflow
                          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                        </span>
                      </div>
                    </Link>
                    <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-full text-xs sm:h-8 sm:w-auto"
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
