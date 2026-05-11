"use client";

import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
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
  if (!folder) return "-";
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
  /** When true, rows are not links (no open detail); list is view-only. Overrides navigation if getEmailLink were set. */
  readOnly?: boolean;
  /** History / inbox list: department retag (non-admin → approval request). */
  showRetag?: boolean;
  onRetagDone?: () => void;
  /** Admin deleted-mail list: show mailbox owner column */
  showMailbox?: boolean;
}

export function EmailsTable({
  emails,
  isLoading,
  emptyMessage = "No emails found.",
  className,
  getEmailLink,
  readOnly = false,
  showRetag,
  onRetagDone,
  showMailbox,
}: EmailsTableProps) {
  const router = useRouter();
  const shouldShowRetag = showRetag ?? true;
  const isClickable = !!getEmailLink && !readOnly;

  if (isLoading) {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="glass-surface space-y-3 rounded-2xl p-3 md:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-panel/50 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-[80%] max-w-xs" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
        <div className="glass-surface hidden overflow-hidden rounded-2xl md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-elevated/70">
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Sender</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Department</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Received</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Folder</th>
                {showMailbox ? (
                  <th className="min-w-[7rem] px-2 py-2 text-left text-xs font-medium text-muted-foreground">Mailbox</th>
                ) : null}
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
                  <td className="px-2 py-2">
                    <Skeleton className="h-4 w-48" />
                  </td>
                  <td className="px-2 py-2">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="px-2 py-2">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-2 py-2">
                    <Skeleton className="h-5 w-14" />
                  </td>
                  <td className="px-2 py-2">
                    <Skeleton className="h-5 w-16" />
                  </td>
                  <td className="px-2 py-2">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  {showMailbox ? (
                    <td className="px-2 py-2">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ) : null}
                  {shouldShowRetag ? (
                    <td className="px-2 py-2">
                      <Skeleton className="h-8 w-[180px]" />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    const emptyClassName = cn(
      "glass-surface flex min-w-0 flex-col items-center justify-center rounded-2xl px-4 py-10 sm:py-12",
      className
    );
    return (
      <div className={emptyClassName}>
        <p className="text-center text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="glass-surface space-y-3 rounded-2xl p-3 md:hidden">
        {emails.map((email) => {
          const go = () => {
            if (getEmailLink && !readOnly) router.push(getEmailLink(email));
          };
          const onKeyDown = (e: KeyboardEvent) => {
            if (!isClickable) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              go();
            }
          };
          return (
            <div
              key={email.id}
              className={cn(
                "rounded-xl border border-border/80 bg-panel/80 p-3 shadow-sm transition-colors",
                isClickable && "cursor-pointer hover:border-border active:bg-muted/50"
              )}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={isClickable ? go : undefined}
              onKeyDown={onKeyDown}
            >
              <p className="line-clamp-2 font-medium leading-snug text-foreground" title={email.summary ?? undefined}>
                {email.subject ?? "-"}
              </p>
              <p className="mt-1 break-words text-sm text-muted-foreground">{email.sender ?? "-"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span
                  className="text-xs text-muted-foreground"
                  title={
                    !email.category ? "Same as Inbox department; run sync & classify to assign" : undefined
                  }
                >
                  {email.category ?? "-"}
                </span>
                <PriorityBadge label={email.priorityLabel} />
                <span className="text-xs tabular-nums text-muted-foreground">{formatDate(email.receivedAt)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={folderLabel(email.folder)}>
                {folderLabel(email.folder)}
              </p>
              {showMailbox && email.mailboxOwnerEmail ? (
                <p className="mt-1 truncate text-xs text-muted-foreground" title={email.mailboxOwnerEmail}>
                  Mailbox: {email.mailboxOwnerEmail}
                </p>
              ) : null}
              {shouldShowRetag ? (
                <div
                  className="mt-3 border-t border-border/60 pt-3"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <RetagMailControl emailId={email.id} onDone={onRetagDone ?? (() => { })} compact />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="glass-surface hidden overflow-hidden rounded-2xl md:block">
        <LenisScrollArea axis="horizontal">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel-elevated/70">
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Sender</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Department</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Received</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Folder</th>
                {showMailbox ? (
                  <th className="min-w-[7rem] px-2 py-2 text-left text-xs font-medium text-muted-foreground">Mailbox</th>
                ) : null}
                {shouldShowRetag ? (
                  <th className="min-w-0 whitespace-nowrap px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    Retag
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => {
                const rowClass = cn(
                  "border-b border-border/60 transition-colors",
                  !readOnly && "hover:bg-muted/60"
                );
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
                    <td
                      className="min-w-[100px] max-w-[280px] break-words px-2 py-2 font-medium text-foreground"
                      title={email.summary ?? undefined}
                    >
                      {email.subject ?? "-"}
                    </td>
                    <td className="min-w-[100px] max-w-[200px] break-words px-2 py-2 text-muted-foreground">
                      {email.sender ?? "-"}
                    </td>
                    <td
                      className="px-2 py-2 text-muted-foreground"
                      title={!email.category ? "Same as Inbox department; run sync & classify to assign" : undefined}
                    >
                      {email.category ?? "-"}
                    </td>
                    <td className="px-2 py-2">
                      <PriorityBadge label={email.priorityLabel} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                      {formatDate(email.receivedAt)}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{folderLabel(email.folder)}</td>
                    {showMailbox ? (
                      <td className="max-w-[10rem] truncate px-2 py-2 text-muted-foreground" title={email.mailboxOwnerEmail ?? ""}>
                        {email.mailboxOwnerEmail ?? "-"}
                      </td>
                    ) : null}
                    {shouldShowRetag ? (
                      <td
                        className="w-[1%] whitespace-nowrap px-2 py-2 align-middle"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <RetagMailControl emailId={email.id} onDone={onRetagDone ?? (() => { })} compact />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </LenisScrollArea>
      </div>
    </div>
  );
}
