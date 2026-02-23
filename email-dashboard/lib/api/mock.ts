import type {
  HealthResponse,
  DashboardMetrics,
  EmailsResponse,
  QueueStatusResponse,
  SettingsConfig,
} from "@/lib/types";

const now = new Date();
const today = now.toISOString().slice(0, 10);

function randomDate(daysAgo: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  return d.toISOString();
}

const mockEmails = Array.from({ length: 24 }, (_, i) => ({
  id: `email-${i + 1}`,
  messageId: `msg-${1000 + i}@graph.microsoft.com`,
  subject: [
    "Q4 budget review",
    "Re: Server outage incident",
    "Invoice INV-2024-001",
    "Demo request - Acme Corp",
    "Resume: Senior Developer",
    "Bug report: Login timeout",
    "Proposal follow-up",
    "Payment received",
    "Interview schedule",
    "API rate limit discussion",
  ][i % 10],
  sender: [
    "finance@company.com",
    "ops@company.com",
    "billing@vendor.com",
    "lead@acme.com",
    "candidate@email.com",
    "support@partner.com",
    "sales@client.com",
    "payments@bank.com",
    "hr@company.com",
    "dev@external.com",
  ][i % 10],
  receivedAt: randomDate(3),
  folder: ["Inbox", "Inbox", "Inbox", "Sales", "HR", "Tech", "Inbox", "Accounts", "HR", "Tech"][i % 10],
  status: (i % 10 === 2 ? "failed" : "stored") as "stored" | "failed",
}));

export const mockData = {
  health: (): HealthResponse => ({
    status: "healthy",
    timestamp: now.toISOString(),
    version: "1.0.0",
    services: { database: "healthy", redis: "healthy", graph: "healthy" },
  }),

  dashboardMetrics: (): DashboardMetrics => ({
    emailsIngestedToday: 2847,
    queueSize: 12,
    activeWorkers: 4,
  }),

  emails: (params?: { page?: number; pageSize?: number; search?: string }): EmailsResponse => {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    let list = [...mockEmails];
    if (params?.search) {
      const s = params.search.toLowerCase();
      list = list.filter(
        (e) =>
          e.subject.toLowerCase().includes(s) ||
          e.sender.toLowerCase().includes(s) ||
          e.messageId.toLowerCase().includes(s)
      );
    }
    const total = list.length;
    const start = (page - 1) * pageSize;
    const emails = list.slice(start, start + pageSize);
    return { emails, total, page, pageSize };
  },

  queueStatus: (): QueueStatusResponse => ({
    pending: 12,
    active: 3,
    failed: 2,
    retryCount: 5,
    workerUptime: 86400,
    taskDistribution: [
      { name: "ingest", count: 8 },
      { name: "process", count: 5 },
      { name: "webhook", count: 2 },
    ],
  }),

  settings: (): SettingsConfig => ({
    tenantId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    graphClientId: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    redisHost: "redis.internal:6379",
    databaseHost: "postgres.internal:5432",
    environment: "development",
  }),
};
