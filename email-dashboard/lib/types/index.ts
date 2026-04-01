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

/** Outlook / Microsoft Graph calendar event (dashboard widget) */
export interface CalendarEventOut {
  id: string | null;
  subject: string;
  start: { dateTime: string; timeZone?: string } | null;
  end: { dateTime: string; timeZone?: string } | null;
  organizerName: string | null;
  organizerEmail: string | null;
  joinUrl: string | null;
  webLink: string | null;
  isCancelled: boolean;
  isOnlineMeeting: boolean;
  location: string | null;
  showAs?: string | null;
}

export interface CalendarEventsResponse {
  events: CalendarEventOut[];
  error: string | null;
}

export interface NotificationItem {
  id: string;
  kind: "new_mail" | "meeting_scheduled" | "ai_pending" | "important_date" | "unreplied_mail" | string;
  title: string;
  message: string;
  level: "info" | "warning" | "error" | string;
  at: string;
  count?: number;
  href?: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  error: string | null;
}

export interface MyProjectItem {
  projectId: string;
  projectName: string;
  status: "running" | "new" | "planned" | "completed" | string;
  teamName: string | null;
  role: string | null;
  responsibilities: string | null;
  reportsToUserId: string | null;
  structure: { phases?: string[]; notes?: string; currentPhase?: number } | null;
  updatedAt: string | null;
}

export interface MyProjectsResponse {
  projects: MyProjectItem[];
}

export type FollowUpDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface FollowUpTrackerDay {
  key: FollowUpDayKey;
  label: string;
  expected: boolean;
  sentByMe: boolean;
}

export interface FollowUpTrackerProject {
  projectId: string;
  projectName: string;
  teamName: string | null;
  scheduleDays: string[];
  weekStartISO: string;
  weekEndISO: string;
  days: FollowUpTrackerDay[];
}

export interface FollowUpTrackerResponse {
  weekStartISO: string;
  weekEndISO: string;
  projects: FollowUpTrackerProject[];
}

export interface FollowUpReminderItem {
  projectId: string;
  projectName: string;
}

export interface FollowUpRemindersResponse {
  reminders: FollowUpReminderItem[];
  todayKey: string;
}

export interface FollowUpTrackerHistoryEmail {
  emailId: string;
  subject: string | null;
  receivedAt: string;
}

export interface FollowUpTrackerHistoryResponse {
  projectId: string;
  projectName: string;
  emails: FollowUpTrackerHistoryEmail[];
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
  /** Department/team (Tech, Sales, Accounts, etc.) */
  assignedTeam?: string | null;
}

export interface EmailsResponse {
  emails: EmailRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** One email thread (conversation) for Threads view */
export interface ConversationItem {
  conversationId: string;
  subject: string | null;
  lastReceivedAt: string;
  messageCount: number;
  participantsPreview: string;
}

export interface ConversationsResponse {
  conversations: ConversationItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ThreadEmailsResponse {
  conversationId: string;
  emails: EmailDetail[];
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
  bccRecipients?: { email?: string; name?: string }[];
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
  /** Celery workers visible to the broker (shared across users). */
  activeWorkers?: number;
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

// Phase 3 — Escalations & Leads
export interface EscalationLeadItem {
  id: string;
  messageId: string;
  subject: string | null;
  sender: string;
  receivedAt: string;
  assignedTeam: string | null;
  /** AI category / mail type (e.g. from ai_category) */
  mailType?: string | null;
  priorityLabel: string | null;
  summary: string | null;
  /** Mailbox owner (member) for "Created by" column */
  mailboxOwner?: string | null;
  leadLabel?: string | null;
  /** Buying signals from lead detection (e.g. demo_request, budget_discussion) */
  buyingSignals?: string[];
  /** Reasons this was flagged as escalation: priority_high, keywords, negative_tone, re_chain, cc_senior, thread_length */
  escalationReasons?: string[] | null;
  /** Whether the email has been read (from Outlook/is_read) */
  isRead?: boolean;
  /** Set when mail was retagged out of escalation/lead */
  retaggedAt?: string | null;
  retaggedBy?: string | null;
  retagPreviousSummary?: string | null;
}

export interface EscalationsResponse {
  escalations: EscalationLeadItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LeadsResponse {
  leads: EscalationLeadItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Mails moved from escalation/lead to a department via Retag */
export interface RetaggedResponse {
  retagged: EscalationLeadItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RetagActionResponse {
  ok: boolean;
  emailId: string;
  assignedTeam?: string | null;
  requestedTeam?: string | null;
  status?: "pending" | "approved" | "rejected";
  mode?: "applied" | "request";
  requestId?: string;
  message?: string;
}

export interface RetagApprovalOut {
  id: string;
  emailId: string;
  mailboxOwnerEmail: string;
  requestedByEmail: string;
  requestedTeam: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  reviewNote?: string | null;
  emailSubject?: string | null;
  sender?: string | null;
  receivedAt?: string | null;
}

export interface MyRetagRequestsResponse {
  requests: RetagApprovalOut[];
  total: number;
  page: number;
  pageSize: number;
}

// Phase 4 — Admin (teams, users, workflow)
export interface TeamOut {
  id: string;
  name: string;
  slug: string | null;
  memberCount: number;
}

/** User with escalation count and status (read/unread/replied) for admin dashboard. */
export interface UserEscalationCountOut {
  email: string;
  displayName: string | null;
  escalationCount: number;
  readCount?: number;
  unreadCount?: number;
  repliedCount?: number;
}

/** User with lead count and status (read/unread/replied) for admin dashboard. */
export interface UserLeadCountOut {
  email: string;
  displayName: string | null;
  leadCount: number;
  readCount?: number;
  unreadCount?: number;
  repliedCount?: number;
}

export interface UserOut {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  teamId: string | null;
  teamName: string | null;
  managerId: string | null;
  isTeamLead: boolean;
  reportCount: number;
  /** Last successful /api/me sync (ISO). */
  lastLoginAt?: string | null;
  /** Account created in app DB (ISO). */
  createdAt?: string | null;
}

export interface WorkflowNode {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  teamName: string | null;
  isTeamLead: boolean;
  managerId: string | null;
  reportIds: string[];
  /** Team project names this user is assigned to (admin team projects). */
  projectNames?: string[];
}

/** Tree node for hierarchy chart (WorkflowNode with nested children). */
export interface WorkflowTreeNode extends WorkflowNode {
  children: WorkflowTreeNode[];
}

export interface TeamStatusOut {
  teamId: string;
  teamName: string;
  emailsAssigned: number;
  escalationsCount: number;
  leadsCount: number;
}

export interface ProjectAssignmentOut {
  userId: string;
  email: string;
  displayName: string | null;
  /** Role on this project (e.g. Tech lead). */
  role?: string | null;
  /** What this person does on the project. */
  responsibilities?: string | null;
  /** Another assignee they report to on this project only (not org manager). */
  reportsToUserId?: string | null;
}

export interface ProjectAssignmentUpsert {
  userId: string;
  role?: string | null;
  responsibilities?: string | null;
  reportsToUserId?: string | null;
}

export interface TeamProjectOut {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  status: "running" | "new" | "planned" | "completed";
  structure: { phases?: string[]; notes?: string; currentPhase?: number } | null;
  /** Explicit project lead; must be an assigned user. Not the same as org "team lead". */
  projectLeadUserId?: string | null;
  /** Admin user who created the project (mailbox threads are scoped to this user). */
  createdByUserId?: string | null;
  assignedUsers: ProjectAssignmentOut[];
  createdAt: string;
  updatedAt: string;
}

/** Admin Tracker: weekday keys stored and returned by API (UTC week). */
export type TrackerDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface TrackerDayState {
  key: TrackerDayKey;
  label: string;
  expected: boolean;
  sent: boolean;
}

export interface ProjectTrackerRow {
  projectId: string;
  projectName: string;
  teamName: string | null;
  scheduleDays: string[];
  weekStartISO: string;
  weekEndISO: string;
  days: TrackerDayState[];
}

export interface TrackerDashboardResponse {
  projects: ProjectTrackerRow[];
}

export interface TrackerEmailListItem {
  emailId: string;
  subject: string | null;
  receivedAt: string;
  senderEmail: string;
  mailboxOwnerEmail: string | null;
}

export interface TrackerProjectEmailsResponse {
  projectId: string;
  projectName: string;
  weekStartISO: string;
  weekEndISO: string;
  emails: TrackerEmailListItem[];
}

export interface ReviewEscalationUser {
  email: string;
  displayName: string | null;
  escalationCount: number;
  repliedCount: number;
  pendingCount: number;
}

export interface ReviewProjectTrackerUser {
  email: string;
  displayName: string | null;
  trackerCount: number;
  hasSentTracker: boolean;
}

/** Shown after an admin assigns Manager or Admin until the user dismisses it. */
export interface RolePromotionPayload {
  show: boolean;
  role: string;
  promotedAt: string | null;
}

export interface MeResponse {
  userId?: string;
  email: string;
  role: string;
  isAdmin: boolean;
  /** Who the user reports to (set in admin Team leaders). */
  reportingManager?: { displayName: string | null; email: string } | null;
  /** Department/team name the user belongs to. */
  department?: string | null;
  rolePromotion?: RolePromotionPayload | null;
}

export interface RecentSignInOut {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  lastLoginAt: string | null;
  createdAt: string | null;
}

/** One persisted session: created at login, closed at logout. */
export interface LoginEventOut {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  loginAt: string;
  logoutAt: string | null;
  isLoggedIn: boolean;
  /** oauth = Microsoft sign-in; session = opened from /api/me without oauth. */
  loginSource: string;
}

export interface LoginSyncStatusOut {
  totalUsers: number;
  usersWithLastLoginAt: number;
  usersMissingLastLoginAt: number;
  totalLoginEvents: number;
  activeSessions: number;
  oauthEvents24h: number;
  sessionEvents24h: number;
  lastOauthEventAt: string | null;
  lastAnyEventAt: string | null;
  syncHealth: "healthy" | "warning" | "error" | string;
}
