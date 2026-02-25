import type {
  HealthResponse,
  DashboardMetrics,
  EmailsResponse,
  EmailDetail,
  QueueStatusResponse,
  SettingsConfig,
  SystemHealthResponse,
} from "@/lib/types";

// Backend URL: from NEXT_PUBLIC_API_URL or default for local dev so frontend always fetches from FastAPI
const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL?.trim())
    ? process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/$/, "")
    : "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof (body as { error?: string }).error === "string" ? (body as { error: string }).error : `API error: ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** URL to open or download an email attachment (PDFs open inline so users can read content). */
export function getAttachmentUrl(emailId: string, attachmentId: string, download = false): string {
  const params = download ? "?download=1" : "";
  return `${API_BASE}/api/emails/${emailId}/attachments/${attachmentId}${params}`;
}

export const api = {
  getHealth: () => fetchApi<HealthResponse>("/api/health"),
  getDashboardMetrics: () => fetchApi<DashboardMetrics>("/api/dashboard/metrics"),
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
    return fetchApi<EmailsResponse>(`/api/emails${q ? `?${q}` : ""}`);
  },
  getEmail: (id: string) => fetchApi<EmailDetail>(`/api/emails/${id}`),
  getAttachmentUrl,
  getQueueStatus: () => fetchApi<QueueStatusResponse>("/api/queue/status"),
  getSettings: () => fetchApi<SettingsConfig>("/api/settings"),
  triggerBackfill: (body?: { user_id?: string; folder_id?: string; days?: number; all?: boolean }) =>
    fetchApi<{ ok: boolean; taskId?: string; userId?: string; message?: string; error?: string }>(
      "/api/emails/backfill",
      { method: "POST", body: JSON.stringify(body ?? {}) }
    ),
  triggerClassifyBackfill: (body?: { limit?: number }) =>
    fetchApi<{ ok: boolean; taskId?: string; message?: string; error?: string }>(
      "/api/emails/classify-backfill",
      { method: "POST", body: JSON.stringify(body ?? {}) }
    ),
  retryAi: (emailId: string) =>
    fetchApi<{ ok: boolean; message?: string; emailId?: string }>(
      `/api/emails/${emailId}/retry-ai`,
      { method: "POST" }
    ),
  getSystemHealth: () => fetchApi<SystemHealthResponse>("/api/system/health"),
};
