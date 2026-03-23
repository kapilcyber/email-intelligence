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
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
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
    setAssignedUserIds([]);
  };

  const toggleAssignedUser = (userId: string) => {
    setAssignedUserIds((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));
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
      assignedUserIds,
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
    setAssignedUserIds(p.assignedUsers.map((u) => u.userId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <FolderKanban className="h-6 w-6" />
          Projects
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Define team projects, structure (phases & notes), status, and assign users. Click a project to open its workflow
          view (phases + reporting chart).
        </p>
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
            <div className="max-h-44 space-y-1 overflow-auto rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(u.id)}
                    onChange={() => toggleAssignedUser(u.id)}
                  />
                  <span>{u.displayName ?? u.email}</span>
                </label>
              ))}
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
                          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                            Assigned: {p.assignedUsers.map((u) => u.displayName ?? u.email).join(", ") || "None"}
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
