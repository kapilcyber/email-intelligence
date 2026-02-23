"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { EmailDetail } from "@/lib/types";
import { ArrowLeft, Paperclip, Mail, Calendar, Users, Folder, ExternalLink, Download, Sparkles, MessageSquare, AlertTriangle, RefreshCw } from "lucide-react";
import { PriorityBadge } from "@/components/status/priority-badge";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRecipients(recipients: { email?: string; name?: string }[]) {
  if (!recipients?.length) return "—";
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

export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Invalid email id");
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getEmail(id)
      .then(setEmail)
      .catch(() => setError("Failed to load email"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/emails")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to emails
        </Button>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900/50">
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
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/emails")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to emails
        </Button>
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-6 py-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error ?? "Email not found."}
        </div>
      </div>
    );
  }

  const isHtml = (email.bodyContentType || "").toLowerCase() === "html";
  const bodyContent = email.bodyContent || email.bodyPreview || null;
  const displayFolder = folderLabel(email.folder);

  const hasSummary = email.summary != null && String(email.summary).trim() !== "";
  if (email.summary === undefined || email.summary === null) {
    if (typeof window !== "undefined") console.log("[Email detail] summary is undefined for email", email.id);
  }

  const aiFailed = email.aiStatus === "failed";
  const handleRetryAi = () => {
    setRetrying(true);
    api
      .retryAi(email.id)
      .then(() => {
        setRetrying(false);
        api.getEmail(email.id).then(setEmail);
      })
      .catch(() => setRetrying(false));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/emails")}
        className="-ml-1 gap-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to emails
      </Button>

      <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
        {/* Subject */}
        <header className="border-b border-neutral-100 px-6 py-5 dark:border-neutral-800">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {email.subject || "(No subject)"}
          </h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">From</p>
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
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">To</p>
                <p className="mt-0.5 break-words text-sm text-neutral-700 dark:text-neutral-200">
                  {formatRecipients(email.toRecipients)}
                </p>
              </div>
            </div>
            {email.ccRecipients?.length > 0 && (
              <div className="flex gap-3 sm:col-span-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Cc</p>
                  <p className="mt-0.5 break-words text-sm text-neutral-700 dark:text-neutral-200">
                    {formatRecipients(email.ccRecipients)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Date</p>
                <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-200">{formatDate(email.receivedAt)}</p>
              </div>
            </div>
            {displayFolder && (
              <div className="flex gap-3">
                <Folder className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Folder</p>
                  <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-200">{displayFolder}</p>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* AI Insights — always show; summary has fallback when missing */}
        <div className="border-b border-neutral-100 bg-neutral-50/60 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-800/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <Sparkles className="h-4 w-4" />
              AI insights
            </div>
            <div className="flex items-center gap-2">
              {email.aiStatus && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    email.aiStatus === "completed"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : email.aiStatus === "failed"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {email.aiStatus === "completed" ? "Completed" : email.aiStatus === "failed" ? "Failed" : "Pending"}
                </span>
              )}
              {email.aiProcessedAt && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Processed {formatDate(email.aiProcessedAt)}
                </span>
              )}
            </div>
          </div>
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
                <p className="mt-0.5 text-sm italic text-neutral-500 dark:text-neutral-400">
                  Summary not available (AI pending or failed).
                </p>
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
                <ul className="space-y-1.5">
                  {email.suggestedReplies.map((reply, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300"
                    >
                      {reply}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {email.attachments.length > 0 && (
          <div className="border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
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

        <div className="px-6 py-5">
          {bodyContent ? (
            isHtml ? (
              <div
                className="prose prose-neutral dark:prose-invert prose-sm max-w-none prose-img:rounded-lg prose-a:text-blue-600 dark:prose-a:text-blue-400 [&_*]:max-w-full"
                style={{ overflowWrap: "break-word" }}
                dangerouslySetInnerHTML={{ __html: bodyContent }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {bodyContent}
              </pre>
            )
          ) : (
            <p className="text-neutral-500 dark:text-neutral-400">No body content.</p>
          )}
        </div>
      </article>
    </div>
  );
}
