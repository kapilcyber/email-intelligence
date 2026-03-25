"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { ConversationItem, EmailDetail } from "@/lib/types";
import { ThreadEmailCard } from "@/components/threads/threads-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, MessageSquare } from "lucide-react";

const PAGE_SIZE = 15;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ProjectMailboxThreads({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<EmailDetail[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !projectId) return;
    setLoading(true);
    setError(null);
    api
      .getProjectMailboxThreads(projectId, { page, pageSize: PAGE_SIZE })
      .then((res) => {
        setConversations(res.conversations);
        setTotal(res.total);
      })
      .catch((e: Error) => setError(e.message || "Failed to load related mail"))
      .finally(() => setLoading(false));
  }, [status, api, projectId, page]);

  useEffect(() => {
    if (!selectedId || status !== "authenticated") {
      setThreadEmails(null);
      return;
    }
    setThreadLoading(true);
    api
      .getProjectMailboxThreadEmails(projectId, selectedId)
      .then((res) => setThreadEmails(res.emails))
      .catch(() => setThreadEmails([]))
      .finally(() => setThreadLoading(false));
  }, [selectedId, status, api, projectId]);

  const selected = useMemo(
    () => conversations.find((c) => c.conversationId === selectedId) ?? null,
    [conversations, selectedId]
  );

  if (status !== "authenticated") return null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950/30">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Related mail (your mailbox)</h2>
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Only mail that contains your project name <strong>“{projectName}”</strong> in the <strong>subject</strong> or{" "}
          <strong>body</strong> (case-insensitive). A thread appears if that text appears in at least one{" "}
          <strong>Inbox</strong>, <strong>Spam</strong>, or <strong>Junk</strong> message. The list and opened thread show{" "}
          <strong>only</strong> those messages—not the whole chain.
        </p>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,340px)_1fr] md:divide-x md:divide-neutral-200 dark:md:divide-neutral-800">
        <div className="max-h-[480px] overflow-y-auto border-b border-neutral-200 md:border-b-0 dark:border-neutral-800">
          {loading && (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}
          {!loading && error && (
            <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
          )}
          {!loading && !error && conversations.length === 0 && (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
              No messages yet that include this project name in subject or body (in Inbox/Spam/Junk). Put the exact
              project name in the subject or message text, sync mail, and use Threads → Detect reply chains if needed.
            </div>
          )}
          {!loading &&
            !error &&
            conversations.map((c) => (
              <button
                key={c.conversationId}
                type="button"
                onClick={() => setSelectedId(c.conversationId)}
                className={`w-full border-b border-neutral-100 px-4 py-3 text-left text-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40 ${
                  selectedId === c.conversationId ? "bg-indigo-50 dark:bg-indigo-950/30" : ""
                }`}
              >
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{c.subject || "(No subject)"}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">{c.participantsPreview || "—"}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {c.messageCount} message{c.messageCount !== 1 ? "s" : ""} · {formatDate(c.lastReceivedAt)}
                </p>
              </button>
            ))}
          {!loading && !error && total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <span className="text-xs text-neutral-500">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
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
        </div>

        <div className="min-h-[200px] max-h-[560px] overflow-y-auto p-4">
          {!selectedId && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-neutral-500">
              <MessageSquare className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm">Select a thread to see replies</p>
            </div>
          )}
          {selectedId && (
            <>
              <p className="mb-3 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {selected?.subject ?? "Thread"}
              </p>
              {threadLoading && (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-lg" />
                  ))}
                </div>
              )}
              {!threadLoading && threadEmails && threadEmails.length === 0 && (
                <p className="text-sm text-neutral-500">No messages loaded.</p>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
