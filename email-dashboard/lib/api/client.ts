import type {
  HealthResponse,
  DashboardMetrics,
  EmailsResponse,
  EmailDetail,
  QueueStatusResponse,
  SettingsConfig,
  SystemHealthResponse,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function buildHeaders(userEmail: string | null, extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userEmail?.trim()) headers["X-User-Email"] = userEmail.trim();
  return { ...headers, ...(extra as Record<string, string>) };
}

async function fetchApi<T>(path: string, options?: RequestInit, userEmail?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildHeaders(userEmail ?? null, options?.headers),
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

function createApi(userEmail: string | null) {
  const withUser = <T>(path: string, options?: RequestInit) => fetchApi<T>(path, options, userEmail);
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
  };
}

/** API client scoped to the given user (session email). Pass null when unauthenticated; backend will return 401. */
export function getApi(userEmail: string | null) {
  return createApi(userEmail);
}

/** Legacy default api (no user header). Use getApi(session?.user?.email) in app code for per-user data. */
export const api = createApi(null);
