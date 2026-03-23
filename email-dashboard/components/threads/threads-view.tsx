"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi, getAttachmentUrl } from "@/lib/api/client";
import type { ConversationItem, EmailDetail } from "@/lib/types";
import { stripQuotedContentForThread } from "@/lib/email-body-strip-quotes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, MessageSquare, Calendar, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRecipients(recipients: { email?: string; name?: string }[] | undefined) {
  if (!recipients?.length) return "—";
  return recipients
    .map((r) => (r.name && r.name !== r.email ? `${r.name} <${r.email}>` : r.email))
    .filter(Boolean)
    .join(", ");
}

/** Format milliseconds since previous message as "Replied in 5m", "2h", "1d", etc. */
function formatResponseTime(ms: number): string {
  if (ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}d`;
  if (hr > 0) return `${hr}h`;
  if (min > 0) return `${min}m`;
  if (sec > 0) return `${sec}s`;
  return "<1s";
}

function ThreadEmailCard({ email, index, responseTimeMs }: { email: EmailDetail; index: number; responseTimeMs?: number }) {
  const isHtml = (email.bodyContentType || "").toLowerCase() === "html";
  const rawBody = email.bodyContent || email.bodyPreview || null;
  const stripped =
    rawBody != null
      ? stripQuotedContentForThread(rawBody, email.bodyContentType, index > 0)
      : null;
  const body = stripped != null && stripped.trim().length > 0 ? stripped : rawBody;
  const isFirst = index === 0;
  const replyLabel = index === 0 ? "Original" : `Reply ${index}`;

  return (
    <article
      className={`relative rounded-lg border bg-white dark:bg-neutral-900/50 dark:border-neutral-700 ${
        isFirst ? "border-neutral-200" : "border-l-2 border-l-neutral-300 dark:border-l-neutral-600 ml-4 pl-4 dark:bg-neutral-900/30"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            {replyLabel}
          </span>
          {responseTimeMs != null && responseTimeMs >= 0 && (
            <span className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" title="Time since previous message">
              Replied in {formatResponseTime(responseTimeMs)}
            </span>
          )}
          <Mail className="h-4 w-4 shrink-0 text-neutral-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {email.senderDisplayName && email.senderDisplayName !== email.sender
                ? `${email.senderDisplayName} <${email.sender}>`
                : email.sender}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              To: {formatRecipients(email.toRecipients)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(email.receivedAt)}
        </div>
      </header>
      <div className="px-4 py-3">
        {body &&
          (isHtml ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">{body}</p>
          ))}
        {email.attachments?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {email.attachments.map((a) => (
              <a
                key={a.id}
                href={getAttachmentUrl(email.id, a.id, true)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                {a.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export interface ThreadsViewProps {
  /** Base route for “Back” (e.g. `/threads`) */
  basePath: string;
}

export function ThreadsView({ basePath }: ThreadsViewProps) {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<EmailDetail[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.conversationId === selectedId) ?? null,
    [conversations, selectedId]
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    api
      .getConversations({ page, pageSize: PAGE_SIZE, search: search || undefined })
      .then((res) => {
        setConversations(res.conversations);
        setTotal(res.total);
      })
      .catch(() => setError("Failed to load conversations"))
      .finally(() => setLoading(false));
  }, [status, api, page, search]);

  useEffect(() => {
    if (!selectedId || status !== "authenticated") {
      setThreadEmails(null);
      return;
    }
    setThreadLoading(true);
    api
      .getConversationEmails(selectedId)
      .then((res) => setThreadEmails(res.emails))
      .catch(() => setThreadEmails([]))
      .finally(() => setThreadLoading(false));
  }, [selectedId, status, api]);

  const runBackfillConversationIds = () => {
    if (status !== "authenticated") return;
    setBackfilling(true);
    setBackfillMessage(null);
    api
      .backfillConversationIds(100)
      .then((res) => {
        setBackfillMessage(res.ok ? (res.message ?? `Updated ${res.updated ?? 0} email(s).`) : (res.error ?? "Failed."));
        if (res.ok && (res.updated ?? 0) > 0) {
          return api.getConversations({ page, pageSize: PAGE_SIZE, search: search || undefined });
        }
      })
      .then((res) => {
        if (res) {
          setConversations(res.conversations);
          setTotal(res.total);
        }
      })
      .catch(() => setBackfillMessage("Request failed."))
      .finally(() => setBackfilling(false));
  };

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-neutral-500">Sign in to view threads.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <aside className="flex w-full flex-col border-r border-neutral-200 bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-900/30 md:w-96">
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Threads</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Real reply chains only. Sync from History (Inbox + Sent) so your sent replies appear here.
          </p>
          <div className="mt-3">
            <input
              type="search"
              placeholder="Search by subject or sender…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:placeholder:text-neutral-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}
          {!loading && error && (
            <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
          )}
          {!loading && !error && conversations.length === 0 && (
            <div className="space-y-3 p-4">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No reply-chain threads yet. Existing mail may need conversation IDs from Microsoft Graph.
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                You don’t need to log in again. Click below to detect reply chains from your synced mail; then refresh.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={runBackfillConversationIds}
                disabled={backfilling}
                className="w-full"
              >
                {backfilling ? "Detecting…" : "Detect reply chains"}
              </Button>
              {backfillMessage && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{backfillMessage}</p>
              )}
            </div>
          )}
          {!loading &&
            !error &&
            conversations.map((c) => (
              <button
                key={c.conversationId}
                type="button"
                onClick={() => setSelectedId(c.conversationId)}
                className={`w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800/50 ${
                  selectedId === c.conversationId
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "bg-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                      {c.subject || "(No subject)"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {c.participantsPreview || "—"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {c.messageCount} message{c.messageCount !== 1 ? "s" : ""} · {formatDate(c.lastReceivedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                </div>
              </button>
            ))}
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-2 dark:border-neutral-700">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-neutral-500">
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-950">
        {!selectedId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <MessageSquare className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Select a conversation</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              Choose a thread from the list to see the full back-and-forth.
            </p>
          </div>
        )}
        {selectedId && (
          <>
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Link href={basePath}>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                </Link>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">/</span>
                <h2 className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {selectedConversation?.subject ?? "Thread"}
                </h2>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {threadLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              )}
              {!threadLoading && threadEmails && threadEmails.length === 0 && (
                <p className="text-sm text-neutral-500">No messages in this thread.</p>
              )}
              {!threadLoading && threadEmails && threadEmails.length > 0 && (
                <div className="mx-auto max-w-3xl space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Conversation (reply chain)
                  </p>
                  {threadEmails.map((email, index) => {
                    const prevAt = index > 0 ? new Date(threadEmails[index - 1].receivedAt).getTime() : null;
                    const currAt = new Date(email.receivedAt).getTime();
                    const responseTimeMs = prevAt != null ? currAt - prevAt : undefined;
                    return (
                      <ThreadEmailCard
                        key={email.id}
                        email={email}
                        index={index}
                        responseTimeMs={responseTimeMs}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
