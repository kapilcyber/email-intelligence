"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import type { EmailDetail } from "@/lib/types";
import {
  Paperclip,
  Mail,
  Calendar,
  Users,
  Folder,
  ExternalLink,
  Download,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Send,
} from "lucide-react";
import { PriorityBadge } from "@/components/status/priority-badge";
import {
  emailBodySurfaceClassName,
  emailHtmlProseClassName,
  sanitizeEmailHtml,
} from "@/lib/sanitize-email-html";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRecipients(recipients: { email?: string; name?: string }[]) {
  if (!recipients?.length) return "-";
  return recipients
    .map((r) => (r.name && r.name !== r.email ? `${r.name} <${r.email}>` : r.email))
    .filter(Boolean)
    .join(", ");
}

function folderLabel(folder: string | null | undefined) {
  if (!folder) return null;
  if (folder.length > 40 && !folder.includes(" ")) return "Inbox";
  return folder;
}

const AI_POLL_INTERVAL_MS = 2500;
const AI_POLL_TIMEOUT_MS = 3 * 60 * 1000;
const AI_POLL_MAX_FAILURES = 5;

export default function EmailDetailPage() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [pollNotice, setPollNotice] = useState<string | null>(null);
  const [sendReplyIndex, setSendReplyIndex] = useState<number | null>(null);
  const [replyAllMessage, setReplyAllMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAiPoll = () => {
    if (pollIntervalRef.current != null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearAiPoll();
  }, [id]);

  useEffect(() => {
    if (!id || status !== "authenticated") {
      if (!id) setError("Invalid email id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getEmail(id)
      .then(setEmail)
      .catch(() => setError("Failed to load email"))
      .finally(() => setLoading(false));
  }, [id, status, api]);

  if (loading) {
    return (
      <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50 sm:p-8">
          <div className="mb-6 h-7 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="h-14 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-14 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 sm:px-6">
          <p className="break-words">{error ?? "Email not found."}</p>
        </div>
      </div>
    );
  }

  const isHtml = (email.bodyContentType || "").toLowerCase() === "html";
  const rawBodyContent = email.bodyContent || email.bodyPreview || null;
  const bodyContent =
    rawBodyContent && isHtml ? sanitizeEmailHtml(rawBodyContent) : rawBodyContent;
  const displayFolder = folderLabel(email.folder);

  const hasSummary = email.summary != null && String(email.summary).trim() !== "";
  const summaryStatus = email.aiSummaryStatus ?? (hasSummary ? "completed" : "not_requested");
  if (email.summary === undefined || email.summary === null) {
    if (typeof window !== "undefined") console.log("[Email detail] summary is undefined for email", email.id);
  }

  const aiFailed = email.aiStatus === "failed";

  const handleSendSuggestedReplyAll = async (replyText: string, index: number) => {
    if (!id || !email.graphId) return;
    setReplyAllMessage(null);
    setSendReplyIndex(index);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}/reply-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comment: replyText, contentType: "Text" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      setReplyAllMessage({ type: "ok", text: "Reply all sent from your mailbox." });
    } catch (e) {
      setReplyAllMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Could not send reply.",
      });
    } finally {
      setSendReplyIndex(null);
    }
  };

  const handleRetryAi = () => {
    setPollNotice(null);
    setRetrying(true);
    const emailId = email.id;
    /** Snapshot before re-queue - first GET after POST can still show stale "completed" from the prior run. */
    const beforeProcessedAt = email.aiProcessedAt ?? null;
    const beforeErrorMessage = email.aiErrorMessage ?? null;
    const hadSummaryAtRetry = email.summary != null && String(email.summary).trim() !== "";

    clearAiPoll();
    let sawPending = false;

    const processPollResult = (data: EmailDetail): boolean => {
      if (data.aiStatus === "pending") sawPending = true;

      const procChanged = (data.aiProcessedAt ?? null) !== (beforeProcessedAt ?? null);
      const summaryAppeared =
        !!(data.summary && String(data.summary).trim()) && !hadSummaryAtRetry;
      const errChanged = (data.aiErrorMessage ?? null) !== (beforeErrorMessage ?? null);

      let done = false;
      if (data.aiStatus === "pending") {
        done = false;
      } else if (data.aiStatus === "completed") {
        done = procChanged || summaryAppeared;
      } else if (data.aiStatus === "failed") {
        done = sawPending || procChanged || errChanged;
      } else {
        done = false;
      }

      setEmail(data);
      if (done) {
        clearAiPoll();
        setRetrying(false);
      }
      return done;
    };

    api
      .retryAi(emailId)
      .then(() => {
        const startedAt = Date.now();
        let failures = 0;

        const tick = () => {
          if (Date.now() - startedAt > AI_POLL_TIMEOUT_MS) {
            clearAiPoll();
            setRetrying(false);
            setPollNotice("AI is taking longer than expected. Refresh the page or try Retrieve again.");
            return;
          }
          api
            .getEmail(emailId)
            .then((data) => {
              failures = 0;
              processPollResult(data);
            })
            .catch(() => {
              failures += 1;
              if (failures >= AI_POLL_MAX_FAILURES) {
                clearAiPoll();
                setRetrying(false);
                setPollNotice("Could not load updated AI results. Check your connection and try again.");
              }
            });
        };

        tick();
        pollIntervalRef.current = setInterval(tick, AI_POLL_INTERVAL_MS);
      })
      .catch(() => setRetrying(false));
  };

  const handleGenerateSummary = () => {
    setPollNotice(null);
    setRetrying(true);
    const emailId = email.id;
    const hadSummaryAtStart = email.summary != null && String(email.summary).trim() !== "";
    const beforeSummaryStatus = (email.aiSummaryStatus ?? null) as string | null;

    clearAiPoll();

    const processPollResult = (data: EmailDetail): boolean => {
      const summaryAppeared = !!(data.summary && String(data.summary).trim()) && !hadSummaryAtStart;
      const st = (data.aiSummaryStatus ?? null) as string | null;
      const stChanged = st !== beforeSummaryStatus && (st === "completed" || st === "failed");
      setEmail(data);
      const done = summaryAppeared || stChanged;
      if (done) {
        clearAiPoll();
        setRetrying(false);
      }
      return done;
    };

    api
      .generateSummary(emailId)
      .then(() => {
        const startedAt = Date.now();
        let failures = 0;

        const tick = () => {
          if (Date.now() - startedAt > AI_POLL_TIMEOUT_MS) {
            clearAiPoll();
            setRetrying(false);
            setPollNotice("Summary is taking longer than expected. Refresh the page and try again.");
            return;
          }
          api
            .getEmail(emailId)
            .then((data) => {
              failures = 0;
              processPollResult(data);
            })
            .catch(() => {
              failures += 1;
              if (failures >= AI_POLL_MAX_FAILURES) {
                clearAiPoll();
                setRetrying(false);
                setPollNotice("Could not load updated summary. Check your connection and try again.");
              }
            });
        };

        tick();
        pollIntervalRef.current = setInterval(tick, AI_POLL_INTERVAL_MS);
      })
      .catch(() => setRetrying(false));
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <article className="min-w-0 max-w-full overflow-x-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
        {/* Subject */}
        <header className="border-b border-neutral-100 px-4 py-4 dark:border-neutral-800 sm:px-6 sm:py-5">
          {email.deletedAt ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              This message was removed from your History. An administrator can restore it from{" "}
              <strong>Admin → Deleted mail</strong>.
            </p>
          ) : null}
          <h1 className="min-w-0 break-words text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
            {email.subject || "(No subject)"}
          </h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">From</p>
                <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-200">
                  {email.senderDisplayName && email.senderDisplayName !== email.sender
                    ? `${email.senderDisplayName} <${email.sender}>`
                    : email.sender}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">To</p>
                <p className="mt-0.5 break-words text-sm text-neutral-700 dark:text-neutral-200">
                  {formatRecipients(email.toRecipients)}
                </p>
              </div>
            </div>
            {email.ccRecipients?.length > 0 && (
              <div className="flex gap-3 sm:col-span-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Cc</p>
                  <p className="mt-0.5 break-words text-sm text-neutral-700 dark:text-neutral-200">
                    {formatRecipients(email.ccRecipients)}
                  </p>
                </div>
              </div>
            )}
            {email.bccRecipients && email.bccRecipients.length > 0 && (
              <div className="flex gap-3 sm:col-span-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Bcc</p>
                  <p className="mt-0.5 break-words text-sm text-neutral-700 dark:text-neutral-200">
                    {formatRecipients(email.bccRecipients)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Date</p>
                <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-200">{formatDate(email.receivedAt)}</p>
              </div>
            </div>
            {displayFolder && (
              <div className="flex gap-3">
                <Folder className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Folder</p>
                  <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-200">{displayFolder}</p>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* AI Insights - always show; summary has fallback when missing */}
        <div className="border-b border-neutral-100 bg-neutral-50/60 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-800/30 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <Sparkles className="h-4 w-4" />
              AI insights
            </div>
            <div className="flex items-center gap-2">
              {email.aiStatus && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${email.aiStatus === "completed"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : email.aiStatus === "failed"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                >
                  {email.aiStatus === "completed" ? "Completed" : email.aiStatus === "failed" ? "Failed" : "Pending"}
                </span>
              )}
            </div>
          </div>
          {pollNotice && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {pollNotice}
            </div>
          )}
          {aiFailed && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm">
                  AI processing failed. {email.aiErrorMessage ? ` ${email.aiErrorMessage.slice(0, 120)}…` : ""}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleRetryAi} disabled={retrying} className="shrink-0">
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Re-queuing…" : "Retry"}
              </Button>
            </div>
          )}
          <div className="mt-3 space-y-3">
            <div>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Summary</span>
              {hasSummary ? (
                <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">{email.summary}</p>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
                    {summaryStatus === "pending"
                      ? "Summary is being generated…"
                      : summaryStatus === "failed"
                        ? "Summary generation failed."
                        : "Summary not generated yet."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={handleGenerateSummary}
                    disabled={retrying}
                    title="Generate summary"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                    {retrying ? "Generating…" : "Generate"}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {email.category && (
                <span className="rounded-md bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-600 dark:text-neutral-200">
                  {email.category}
                </span>
              )}
              {email.priorityLabel != null && (
                <PriorityBadge label={email.priorityLabel} />
              )}
            </div>
            {email.suggestedReplies && email.suggestedReplies.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Suggested replies
                </div>
                {!email.graphId && (
                  <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                    Reply-all is unavailable: this message has no Microsoft Graph id (older sync). Re-sync or open from a
                    freshly ingested mail.
                  </p>
                )}
                {replyAllMessage && (
                  <p
                    className={`mb-2 text-xs ${replyAllMessage.type === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {replyAllMessage.text}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {email.suggestedReplies.map((reply, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300"
                    >
                      <p className="min-w-0 flex-1 whitespace-pre-wrap">{reply}</p>
                      {/* Reply-all Send: hidden for now - drop `hidden` from className to show again */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="hidden shrink-0 gap-1"
                        disabled={!email.graphId || sendReplyIndex !== null}
                        title={
                          email.graphId
                            ? "Send reply all from your mailbox (Microsoft 365)"
                            : "Graph message id missing"
                        }
                        onClick={() => handleSendSuggestedReplyAll(reply, i)}
                      >
                        {sendReplyIndex === i ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Send className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Send
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {email.attachments.length > 0 && (
          <div className="border-b border-neutral-100 px-4 py-4 dark:border-neutral-800 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              <Paperclip className="h-4 w-4" />
              Attachments ({email.attachments.length})
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {email.attachments.map((att) => {
                const viewUrl = api.getAttachmentUrl(email.id, att.id);
                const downloadUrl = api.getAttachmentUrl(email.id, att.id, true);
                return (
                  <li
                    key={att.id}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800/50"
                    title={att.content_type ?? undefined}
                  >
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span>{att.name}</span>
                    </a>
                    {att.size != null && (
                      <span className="text-neutral-500">{(att.size / 1024).toFixed(1)} KB</span>
                    )}
                    <a
                      href={downloadUrl}
                      download={att.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600 dark:hover:text-neutral-200"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
          {bodyContent ? (
            <div className={emailBodySurfaceClassName}>
              {isHtml ? (
                <div
                  className={emailHtmlProseClassName}
                  dangerouslySetInnerHTML={{ __html: bodyContent }}
                />
              ) : (
                <pre className="min-w-0 max-w-full whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-neutral-800">
                  {bodyContent}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-neutral-500 dark:text-neutral-400">No body content.</p>
          )}
        </div>
      </article>
    </div>
  );
}
