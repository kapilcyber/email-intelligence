import type {
  HealthResponse,
  DashboardMetrics,
  CalendarEventsResponse,
  EmailsResponse,
  EmailDetail,
  ConversationsResponse,
  ThreadEmailsResponse,
  QueueStatusResponse,
  SettingsConfig,
  SystemHealthResponse,
  EscalationsResponse,
  LeadsResponse,
  TeamOut,
  UserOut,
  UserEscalationCountOut,
  UserLeadCountOut,
  WorkflowNode,
  TeamStatusOut,
  MeResponse,
  TeamProjectOut,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Parse FastAPI `{ detail: string | object[] }` or `{ error: string }` into a user-facing message. */
function apiErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as { detail?: unknown; error?: string; message?: string };
    if (typeof o.error === "string" && o.error.trim()) return o.error;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    const d = o.detail;
    if (typeof d === "string" && d.trim()) return d;
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0] as { msg?: string };
      if (typeof first?.msg === "string") return first.msg;
    }
  }
  return `API error: ${status}`;
}

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
    throw new Error(apiErrorMessage(body, res.status));
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
    getDashboardMetrics: (period?: "daily" | "weekly" | "monthly" | "yearly") =>
      withUser<DashboardMetrics>(`/api/dashboard/metrics${period ? `?period=${encodeURIComponent(period)}` : ""}`),
    /**
     * Dashboard calendar list. Default: meeting invites from synced Mail (`source=mail`, no Calendars.Read).
     * Optional `source=graph` + Bearer for legacy Graph calendarView.
     */
    getDashboardCalendarEvents: (
      days?: number,
      accessToken?: string | null,
      source: "mail" | "graph" = "mail"
    ) => {
      const params = new URLSearchParams();
      if (days != null) params.set("days", String(days));
      if (source) params.set("source", source);
      const q = params.toString();
      const headers =
        accessToken?.trim() != null && accessToken.trim().length > 0
          ? { ...buildHeaders(userEmail ?? null, userDisplayName ?? null), Authorization: `Bearer ${accessToken.trim()}` }
          : buildHeaders(userEmail ?? null, userDisplayName ?? null);
      return fetchApi<CalendarEventsResponse>(
        `/api/dashboard/calendar-events${q ? `?${q}` : ""}`,
        { headers },
        userEmail ?? null,
        userDisplayName ?? null
      );
    },
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
    /** List email threads (conversations) for Threads view */
    getConversations: (params?: { page?: number; pageSize?: number; search?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.search) searchParams.set("search", params.search);
      const q = searchParams.toString();
      return withUser<ConversationsResponse>(`/api/emails/conversations${q ? `?${q}` : ""}`);
    },
    /** Get all emails in a thread (chronological) */
    getConversationEmails: (conversationId: string) =>
      withUser<ThreadEmailsResponse>(`/api/emails/conversations/${encodeURIComponent(conversationId)}/emails`),
    /** Backfill conversationId from Graph so Threads view populates (no re-login needed) */
    backfillConversationIds: (limit?: number) =>
      withUser<{ ok: boolean; updated?: number; message?: string; error?: string }>(
        `/api/emails/backfill-conversation-ids${limit != null ? `?limit=${limit}` : ""}`,
        { method: "POST" }
      ),
    getAttachmentUrl,
    getQueueStatus: () => withUser<QueueStatusResponse>("/api/queue/status"),
    getSettings: () => withUser<SettingsConfig>("/api/settings"),
    triggerBackfill: (body?: { user_id?: string; folder_id?: string; days?: number; all?: boolean; from_date?: string; to_date?: string }) =>
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
    /** Admin: list users with escalation count (for escalations-by-user view). */
    getEscalationCountsByUser: () =>
      withUser<UserEscalationCountOut[]>("/api/admin/escalation-counts"),
    /** Admin: list escalations for a specific user's mailbox. */
    getAdminEscalationsForUser: (params: {
      mailbox: string;
      page?: number;
      pageSize?: number;
      from?: string;
      team?: string;
    }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("mailbox", params.mailbox);
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.from) searchParams.set("from", params.from);
      if (params?.team) searchParams.set("team", params.team);
      return withUser<EscalationsResponse>(`/api/admin/escalations?${searchParams.toString()}`);
    },
    getLeads: (params?: { page?: number; pageSize?: number; label?: string; team?: string; from?: string; mine?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.label) searchParams.set("label", params.label);
      if (params?.team) searchParams.set("team", params.team);
      if (params?.from) searchParams.set("from", params.from);
      if (params?.mine === true) searchParams.set("mine", "true");
      const q = searchParams.toString();
      return withUser<LeadsResponse>(`/api/leads${q ? `?${q}` : ""}`);
    },
    /** Admin: list users with lead count (for leads-by-user view). */
    getLeadCountsByUser: () =>
      withUser<UserLeadCountOut[]>("/api/admin/lead-counts"),
    /** Admin: list leads for a specific user's mailbox. */
    getAdminLeadsForUser: (params: {
      mailbox: string;
      page?: number;
      pageSize?: number;
      label?: string;
      from?: string;
      team?: string;
    }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("mailbox", params.mailbox);
      if (params?.page != null) searchParams.set("page", String(params.page));
      if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
      if (params?.label) searchParams.set("label", params.label);
      if (params?.from) searchParams.set("from", params.from);
      if (params?.team) searchParams.set("team", params.team);
      return withUser<LeadsResponse>(`/api/admin/leads?${searchParams.toString()}`);
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
      // Include managerId when present (use "" for "No manager" so backend clears it)
      if (data.managerId !== undefined) searchParams.set("managerId", data.managerId);
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
    getProjectsWorkflow: (params?: { teamId?: string; status?: "running" | "new" | "planned" | "completed" }) => {
      const searchParams = new URLSearchParams();
      if (params?.teamId) searchParams.set("teamId", params.teamId);
      if (params?.status) searchParams.set("status", params.status);
      const q = searchParams.toString();
      return withUser<TeamProjectOut[]>(`/api/admin/projects-workflow${q ? `?${q}` : ""}`);
    },
    getProjectWorkflow: (projectId: string) =>
      withUser<TeamProjectOut>(`/api/admin/projects-workflow/${encodeURIComponent(projectId)}`),
    createProjectWorkflow: (body: {
      name: string;
      teamId?: string | null;
      status?: "running" | "new" | "planned" | "completed";
      structure?: { phases?: string[]; notes?: string };
      assignedUserIds?: string[];
    }) =>
      withUser<TeamProjectOut>("/api/admin/projects-workflow", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateProjectWorkflow: (
      projectId: string,
      body: {
        name: string;
        teamId?: string | null;
        status?: "running" | "new" | "planned" | "completed";
        structure?: { phases?: string[]; notes?: string };
        assignedUserIds?: string[];
      }
    ) =>
      withUser<TeamProjectOut>(`/api/admin/projects-workflow/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };
}

/** API client scoped to the given user (session email and optional display name). Pass null when unauthenticated; backend will return 401. */
export function getApi(userEmail: string | null, userDisplayName?: string | null) {
  return createApi(userEmail, userDisplayName);
}

/** Legacy default api (no user header). Use getApi(session?.user?.email, session?.user?.name) in app code for per-user data. */
export const api = createApi(null);
