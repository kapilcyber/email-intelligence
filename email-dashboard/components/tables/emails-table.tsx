"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/status/priority-badge";
import { RetagMailControl } from "@/components/escalations/retag-mail-control";
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
  /** History / inbox list: department retag (non-admin → approval request). */
  showRetag?: boolean;
  onRetagDone?: () => void;
}

export function EmailsTable({
  emails,
  isLoading,
  emptyMessage = "No emails found.",
  className,
  getEmailLink,
  showRetag,
  onRetagDone,
}: EmailsTableProps) {
  const router = useRouter();
  const shouldShowRetag = showRetag ?? true;

  if (isLoading) {
    return (
      <div className={cn("glass-surface overflow-hidden rounded-2xl", className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-panel-elevated/70">
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Sender</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Department</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Received</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Folder</th>
              {shouldShowRetag ? (
                <th className="min-w-0 whitespace-nowrap px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Retag
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="px-2 py-2"><Skeleton className="h-4 w-48" /></td>
                <td className="px-2 py-2"><Skeleton className="h-4 w-32" /></td>
                <td className="px-2 py-2"><Skeleton className="h-4 w-20" /></td>
                <td className="px-2 py-2"><Skeleton className="h-5 w-14" /></td>
                <td className="px-2 py-2"><Skeleton className="h-5 w-16" /></td>
                <td className="px-2 py-2"><Skeleton className="h-4 w-20" /></td>
                <td className="px-2 py-2"><Skeleton className="h-4 w-16" /></td>
                {shouldShowRetag ? (
                  <td className="px-2 py-2"><Skeleton className="h-8 w-[180px]" /></td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (emails.length === 0) {
    const emptyClassName = cn(
      "glass-surface flex flex-col items-center justify-center rounded-2xl py-12",
      className
    );
    return (
      <div className={emptyClassName}>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("glass-surface overflow-hidden rounded-2xl", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-panel-elevated/70">
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Sender</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Department</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Received</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Folder</th>
              {shouldShowRetag ? (
                <th className="min-w-0 whitespace-nowrap px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Retag
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => {
              const rowClass = "border-b border-border/60 transition-colors hover:bg-muted/60";
              const isClickable = !!getEmailLink;
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
                  <td className="min-w-[100px] max-w-[280px] break-words px-2 py-2 font-medium text-foreground" title={email.summary ?? undefined}>
                    {email.subject ?? "—"}
                  </td>
                  <td className="min-w-[100px] max-w-[200px] break-words px-2 py-2 text-muted-foreground">
                    {email.sender ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground" title={!email.category ? "Same as Inbox department; run sync & classify to assign" : undefined}>
                    {email.category ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <PriorityBadge label={email.priorityLabel} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    {formatDate(email.receivedAt)}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{folderLabel(email.folder)}</td>
                  {shouldShowRetag ? (
                    <td
                      className="w-[1%] whitespace-nowrap px-2 py-2 align-middle"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RetagMailControl emailId={email.id} onDone={onRetagDone ?? (() => {})} compact />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
