import type {
  HealthResponse,
  DashboardMetrics,
  EmailsResponse,
  EmailDetail,
  QueueStatusResponse,
  SettingsConfig,
  SystemHealthResponse,
  EscalationsResponse,
  LeadsResponse,
  TeamOut,
  UserOut,
  WorkflowNode,
  TeamStatusOut,
  MeResponse,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function buildHeaders(
  userEmail: string | null,
  userDisplayName?: string | null,
  extra?: HeadersInit
): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userEmail?.trim()) headers["X-User-Email"] = userEmail.trim();
  if (userDisplayName?.trim()) headers["X-User-Name"] = userDisplayName.trim();
  return { ...headers, ...(extra as Record<string, string>) };
}

async function fetchApi<T>(
  path: string,
  options?: RequestInit,
  userEmail?: string | null,
  userDisplayName?: string | null
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildHeaders(userEmail ?? null, userDisplayName ?? null, options?.headers),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === "string" ? (body as { error: string }).error : `API error: ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/**
 * URL for email attachments. Uses the Next.js proxy path so the server can add X-User-Email from session
 * (browser cannot send custom headers for direct backend attachment requests).
 */
export function getAttachmentUrl(emailId: string, attachmentId: string, download = false): string {
  const params = download ? "?download=1" : "";
  return `/api/emails/${emailId}/attachments/${attachmentId}${params}`;
}

function createApi(userEmail: string | null, userDisplayName?: string | null) {
  const withUser = <T>(path: string, options?: RequestInit) =>
    fetchApi<T>(path, options, userEmail, userDisplayName);
  return {
    getHealth: () => withUser<HealthResponse>("/api/health"),
    getDashboardMetrics: () => withUser<DashboardMetrics>("/api/dashboard/metrics"),
    getEmails: (params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      from?: string;
      to?: string;
      category?: string;
      priorityLabel?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.from) searchParams.set("from", params.from);
      if (params?.to) searchParams.set("to", params.to);
      if (params?.category) searchParams.set("category", params.category);
      if (params?.priorityLabel) searchParams.set("priorityLabel", params.priorityLabel);
      const q = searchParams.toString();
      return withUser<EmailsResponse>(`/api/emails${q ? `?${q}` : ""}`);
    },
    getEmail: (id: string) => withUser<EmailDetail>(`/api/emails/${id}`),
    getAttachmentUrl,
    getQueueStatus: () => withUser<QueueStatusResponse>("/api/queue/status"),
    getSettings: () => withUser<SettingsConfig>("/api/settings"),
    triggerBackfill: (body?: { user_id?: string; folder_id?: string; days?: number; all?: boolean }) =>
      withUser<{ ok: boolean; taskId?: string; userId?: string; message?: string; error?: string }>(
        "/api/emails/backfill",
        { method: "POST", body: JSON.stringify(body ?? {}) }
      ),
    triggerClassifyBackfill: (body?: { limit?: number }) =>
      withUser<{ ok: boolean; taskId?: string; message?: string; error?: string }>(
        "/api/emails/classify-backfill",
        { method: "POST", body: JSON.stringify(body ?? {}) }
      ),
    retryAi: (emailId: string) =>
      withUser<{ ok: boolean; message?: string; emailId?: string }>(`/api/emails/${emailId}/retry-ai`, { method: "POST" }),
    getSystemHealth: () => withUser<SystemHealthResponse>("/api/system/health"),
    // Phase 3 — Escalations & Leads
    getEscalations: (params?: { page?: number; pageSize?: number; from?: string; team?: string; mine?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.from) searchParams.set("from", params.from);
      if (params?.team) searchParams.set("team", params.team);
      if (params?.mine === true) searchParams.set("mine", "true");
      const q = searchParams.toString();
      return withUser<EscalationsResponse>(`/api/escalations${q ? `?${q}` : ""}`);
    },
    getLeads: (params?: { page?: number; pageSize?: number; label?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.label) searchParams.set("label", params.label);
      const q = searchParams.toString();
      return withUser<LeadsResponse>(`/api/leads${q ? `?${q}` : ""}`);
    },
    assignEmailToTeam: (emailId: string, team: string) =>
      withUser<{ ok: boolean; emailId: string; assignedTeam: string | null }>(
        `/api/emails/${emailId}/assign?team=${encodeURIComponent(team)}`,
        { method: "PATCH" }
      ),
    // Phase 4 — Admin (requires admin role)
    getMe: () => withUser<MeResponse>("/api/me"),
    getTeams: () => withUser<TeamOut[]>("/api/admin/teams"),
    getTeam: (teamId: string) => withUser<TeamOut>(`/api/admin/teams/${teamId}`),
    getTeamStatus: (teamId: string) => withUser<TeamStatusOut>(`/api/admin/teams/${teamId}/status`),
    getUsers: (params?: { role?: string; teamId?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.role) searchParams.set("role", params.role);
      if (params?.teamId) searchParams.set("teamId", params.teamId);
      const q = searchParams.toString();
      return withUser<UserOut[]>(`/api/admin/users${q ? `?${q}` : ""}`);
    },
    getWorkflow: () => withUser<WorkflowNode[]>("/api/admin/workflow"),
    updateUser: (userId: string, data: { role?: string; teamId?: string; managerId?: string; isTeamLead?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (data.role != null) searchParams.set("role", data.role);
      if (data.teamId != null) searchParams.set("teamId", data.teamId);
      if (data.managerId != null) searchParams.set("managerId", data.managerId);
      if (data.isTeamLead != null) searchParams.set("isTeamLead", String(data.isTeamLead));
      const q = searchParams.toString();
      return withUser<{ ok: boolean; userId: string }>(`/api/admin/users/${userId}?${q}`, { method: "PATCH" });
    },
    createUser: (params: { email: string; displayName?: string; role?: string; teamId?: string }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("email", params.email);
      if (params.displayName) searchParams.set("displayName", params.displayName);
      if (params.role) searchParams.set("role", params.role);
      if (params.teamId) searchParams.set("teamId", params.teamId);
      return withUser<{ ok: boolean; userId: string; email: string }>(
        `/api/admin/users?${searchParams.toString()}`,
        { method: "POST" }
      );
    },
  };
}

/** API client scoped to the given user (session email and optional display name). Pass null when unauthenticated; backend will return 401. */
export function getApi(userEmail: string | null, userDisplayName?: string | null) {
  return createApi(userEmail, userDisplayName);
}

/** Legacy default api (no user header). Use getApi(session?.user?.email, session?.user?.name) in app code for per-user data. */
export const api = createApi(null);
