// API response types for Phase 1

export type SystemStatus = "healthy" | "degraded" | "error";

export interface HealthResponse {
  status: SystemStatus;
  timestamp: string;
  version: string;
  services: {
    database: SystemStatus;
    redis: SystemStatus;
    graph: SystemStatus;
  };
}

export interface DashboardMetrics {
  emailsIngestedToday: number;
  queueSize: number;
  activeWorkers: number;
  /** Phase 2 — AI stats */
  totalEmails?: number;
  totalClassified?: number;
  aiFailureCount?: number;
  categoryCounts?: Record<string, number>;
  priorityCounts?: Record<string, number>;
}

export type EmailStatus = "stored" | "failed";

export type AiStatus = "pending" | "completed" | "failed";
export type ProcessingStatus = "received" | "ingested" | "classified" | "failed";

export interface EmailRecord {
  id: string;
  messageId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  folder: string;
  status: EmailStatus;
  /** Phase 2 — AI */
  summary?: string | null;
  category?: string | null;
  priorityLabel?: string | null;
  priorityScore?: number | null;
  aiStatus?: AiStatus | null;
  aiProcessedAt?: string | null;
  processingStatus?: ProcessingStatus | null;
}

export interface EmailsResponse {
  emails: EmailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmailAttachment {
  id: string;
  name: string;
  content_type: string | null;
  size: number | null;
  is_inline: boolean;
}

export interface EmailDetail {
  id: string;
  messageId: string;
  subject: string | null;
  sender: string;
  senderDisplayName: string | null;
  toRecipients: { email?: string; name?: string }[];
  ccRecipients: { email?: string; name?: string }[];
  receivedAt: string;
  sentAt: string | null;
  folder: string | null;
  bodyPreview: string | null;
  bodyContent: string | null;
  bodyContentType: string | null;
  attachments: EmailAttachment[];
  status: EmailStatus;
  /** Phase 2 — AI */
  summary?: string | null;
  category?: string | null;
  priorityLabel?: string | null;
  priorityScore?: number | null;
  suggestedReplies?: string[];
  aiStatus?: AiStatus | null;
  aiProcessedAt?: string | null;
  processingStatus?: ProcessingStatus | null;
  aiErrorMessage?: string | null;
}

export interface WebhookSubscription {
  subscriptionId: string;
  expirationTime: string;
  lastRenewalTime: string;
  validationStatus: "valid" | "expiring" | "failed";
  resource: string;
}

export interface WebhookErrorLog {
  id: string;
  timestamp: string;
  message: string;
  code?: string;
}

export interface WebhookStatusResponse {
  subscription: WebhookSubscription | null;
  status: "active" | "expiring" | "error";
  errorLogs: WebhookErrorLog[];
}

export interface QueueTaskStats {
  pending: number;
  active: number;
  failed: number;
  retryCount: number;
}

export interface QueueStatusResponse {
  pending: number;
  active: number;
  failed: number;
  retryCount: number;
  workerUptime: number; // seconds
  taskDistribution?: { name: string; count: number }[];
}

export interface SystemHealthResponse {
  webhookStatus: string;
  lastWebhookTimestamp: string | null;
  aiLatencyAvgSeconds: number | null;
  queueBacklog: number;
  queueActive: number;
  timestamp: string;
}

export interface SettingsConfig {
  tenantId: string;
  graphClientId: string;
  redisHost: string;
  databaseHost: string;
  environment: "development" | "staging" | "production";
}
