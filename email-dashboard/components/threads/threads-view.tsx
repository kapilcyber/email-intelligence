"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getApi, getAttachmentUrl } from "@/lib/api/client";
import type { ConversationItem, EmailDetail } from "@/lib/types";
import { stripQuotedContentForThread } from "@/lib/email-body-strip-quotes";
import {
  emailBodySurfaceClassName,
  emailHtmlProseClassName,
  sanitizeEmailHtml,
} from "@/lib/sanitize-email-html";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Calendar, ChevronRight, Download, ArrowLeft } from "lucide-react";
import { DateRangePair } from "@/components/ui/date-range-pair";

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

export function ThreadEmailCard({ email, index, responseTimeMs }: { email: EmailDetail; index: number; responseTimeMs?: number }) {
  const isHtml = (email.bodyContentType || "").toLowerCase() === "html";
  const rawBody = email.bodyContent || email.bodyPreview || null;
  const stripped =
    rawBody != null
      ? stripQuotedContentForThread(rawBody, email.bodyContentType, index > 0)
      : null;
  const body = stripped != null && stripped.trim().length > 0 ? stripped : rawBody;
  const htmlSafe = body && isHtml ? sanitizeEmailHtml(body) : body;
  const isFirst = index === 0;
  const replyLabel = index === 0 ? "Original" : `Reply ${index}`;

  return (
    <article
      className={`relative min-w-0 rounded-lg border bg-white dark:bg-neutral-900/50 dark:border-neutral-700 ${
        isFirst
          ? "border-neutral-200"
          : "ml-2 border-l-2 border-l-neutral-300 pl-2 dark:border-l-neutral-600 dark:bg-neutral-900/30 sm:ml-4 sm:pl-4"
      }`}
    >
      <header className="flex flex-col gap-2 border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-800 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-2 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="shrink-0 rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            {replyLabel}
          </span>
          {responseTimeMs != null && responseTimeMs >= 0 && (
            <span
              className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
              title="Time since previous message"
            >
              Replied in {formatResponseTime(responseTimeMs)}
            </span>
          )}
          <Mail className="h-4 w-4 shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
            <p className="break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {email.senderDisplayName && email.senderDisplayName !== email.sender
                ? `${email.senderDisplayName} <${email.sender}>`
                : email.sender}
            </p>
            <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">
              To: {formatRecipients(email.toRecipients)}
            </p>
            {email.ccRecipients && email.ccRecipients.length > 0 && (
              <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">
                Cc: {formatRecipients(email.ccRecipients)}
              </p>
            )}
            {email.bccRecipients && email.bccRecipients.length > 0 && (
              <p className="break-words text-xs text-neutral-500 dark:text-neutral-400">
                Bcc: {formatRecipients(email.bccRecipients)}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 sm:justify-end">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums">{formatDate(email.receivedAt)}</span>
        </div>
      </header>
      <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
        {body && (
          <div className={emailBodySurfaceClassName}>
            {isHtml ? (
              <div className={emailHtmlProseClassName} dangerouslySetInnerHTML={{ __html: htmlSafe as string }} />
            ) : (
              <p className="min-w-0 max-w-full whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-neutral-200">
                {body}
              </p>
            )}
          </div>
        )}
        {email.attachments?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {email.attachments.map((a) => (
              <a
                key={a.id}
                href={getAttachmentUrl(email.id, a.id, true)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 break-all rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
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

  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportOnlyThread, setExportOnlyThread] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

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

  const handleDownloadReplyReport = async () => {
    if (status !== "authenticated") return;
    setExportErr(null);
    setExportBusy(true);
    try {
      const blob = await api.downloadThreadRepliesCsv({
        from: exportFrom,
        to: exportTo,
        conversationId: exportOnlyThread && selectedId ? selectedId : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thread-replies-${exportFrom}-to-${exportTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setExportBusy(false);
    }
  };

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
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full flex-col md:h-[calc(100dvh-5.5rem)] md:flex-row md:overflow-hidden",
        selectedId && "max-md:min-h-[calc(100dvh-7rem)] max-md:flex-1"
      )}
    >
      <aside
        className={cn(
          "glass-surface-strong flex w-full shrink-0 flex-col border-b border-border md:h-full md:min-h-0 md:w-96 md:border-b-0 md:border-r md:border-border",
          selectedId ? "hidden md:flex" : "flex max-h-[min(48vh,440px)] md:max-h-none"
        )}
      >
        <div className="border-b border-border p-3 sm:p-4">
          <div data-tour-id="threads-sidebar">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-2xl">
              Threads
            </h1>
            <div className="mt-3">
              <input
                type="search"
                placeholder="Search by subject or sender…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-border bg-panel/80 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div data-tour-id="threads-export" className="mt-3 rounded-lg border border-border bg-panel/75 p-3 sm:mt-4">
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">Download reply report (CSV)</p>
            <div className="mt-2 flex min-w-0 flex-col gap-2">
              <DateRangePair
                from={exportFrom}
                to={exportTo}
                onFromChange={setExportFrom}
                onToChange={setExportTo}
                className="w-full min-w-0"
                fieldClassName="relative min-w-0 flex-1"
              />
              {selectedId && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    checked={exportOnlyThread}
                    onChange={(e) => setExportOnlyThread(e.target.checked)}
                    className="rounded border-neutral-300"
                  />
                  Only the selected conversation
                </label>
              )}
              {exportErr && <p className="text-xs text-red-600 dark:text-red-400">{exportErr}</p>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={exportBusy || !exportFrom || !exportTo}
                onClick={handleDownloadReplyReport}
              >
                <Download className="h-4 w-4" />
                {exportBusy ? "Preparing…" : "Download CSV"}
              </Button>
            </div>
          </div>
        </div>
        <LenisScrollArea data-tour-id="threads-list" className="flex-1 min-h-0">
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
                    <p className="line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100 sm:line-clamp-none sm:truncate">
                      {c.subject || "(No subject)"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400 sm:line-clamp-none sm:truncate">
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
        </LenisScrollArea>
        {total > PAGE_SIZE && (
          <div className="grid grid-cols-1 gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-700 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="py-0.5 text-center text-xs text-neutral-500 sm:order-none sm:flex-1 sm:py-0">
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </aside>

      <main
        data-tour-id="threads-detail"
        className={cn(
          "glass-surface flex min-w-0 flex-1 flex-col overflow-hidden md:min-h-0",
          selectedId
            ? "max-md:flex-1 max-md:min-h-0"
            : "min-h-[min(40vh,360px)] max-md:min-h-[min(36vh,280px)]"
        )}
      >
        {!selectedId && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center sm:p-8">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Select a conversation</p>
            <p className="max-w-sm text-xs text-neutral-500 dark:text-neutral-500">
              Choose a thread from the list to see the full back-and-forth.
            </p>
          </div>
        )}
        {selectedId && (
          <>
            <div className="flex min-w-0 items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800 sm:px-4 sm:py-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 md:hidden"
                aria-label="Back to thread list"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h2 className="line-clamp-3 min-w-0 flex-1 break-words text-sm font-medium leading-snug text-neutral-900 dark:text-neutral-100 sm:line-clamp-none sm:truncate">
                {selectedConversation?.subject ?? "Thread"}
              </h2>
            </div>
            <LenisScrollArea className="min-h-0 flex-1" contentClassName="p-3 sm:p-4">
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
                <div className="space-y-3">
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
            </LenisScrollArea>
          </>
        )}
      </main>
    </div>
  );
}
