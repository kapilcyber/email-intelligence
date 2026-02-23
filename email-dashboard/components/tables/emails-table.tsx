"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status/status-badge";
import { PriorityBadge } from "@/components/status/priority-badge";
import type { EmailRecord } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Show readable folder name; backend may still return opaque Graph folder ID for older rows. */
function folderLabel(folder: string) {
  if (!folder) return "—";
  if (folder.length > 40 && !folder.includes(" ")) return "Inbox";
  return folder;
}

interface EmailsTableProps {
  emails: EmailRecord[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  /** When set, rows are clickable and navigate to this path with email id */
  getEmailLink?: (email: EmailRecord) => string;
}

export function EmailsTable({ emails, isLoading, emptyMessage = "No emails found.", className, getEmailLink }: EmailsTableProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800", className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Subject</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Sender</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Priority</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">AI Status</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Received</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Folder</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800/50">
                <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-14" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-14" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (emails.length === 0) {
    const emptyClassName = cn(
      "flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50/50 py-12 dark:border-neutral-800 dark:bg-neutral-900/30",
      className
    );
    return (
      <div className={emptyClassName}>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Subject</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Sender</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Priority</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">AI Status</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Received</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Folder</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600 dark:text-neutral-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => {
              const rowClass = "border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-800/50 dark:hover:bg-neutral-800/30";
              const isClickable = !!getEmailLink;
              const aiStatus = email.aiStatus ?? "pending";
              const aiStatusBadge =
                aiStatus === "completed"
                  ? { label: "Completed", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" }
                  : aiStatus === "failed"
                    ? { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" }
                    : { label: "Pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" };
              return (
                <tr
                  key={email.id}
                  className={cn(rowClass, isClickable && "cursor-pointer")}
                  onClick={isClickable ? () => router.push(getEmailLink!(email)) : undefined}
                  onKeyDown={
                    isClickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(getEmailLink!(email));
                          }
                        }
                      : undefined
                  }
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                >
                  <td className="min-w-[120px] max-w-[320px] break-words px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100" title={email.summary ?? undefined}>
                    {email.subject ?? "—"}
                  </td>
                  <td className="min-w-[120px] max-w-[240px] break-words px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {email.sender ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge label={email.priorityLabel} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${aiStatusBadge.className}`}>
                      {aiStatusBadge.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-500 dark:text-neutral-400">
                    {formatDate(email.receivedAt)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">{folderLabel(email.folder)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={email.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
