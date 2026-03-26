"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FollowUpReminderItem } from "@/lib/types";

type Props = {
  open: boolean;
  items: FollowUpReminderItem[];
  onDismiss: () => void;
};

export function FollowUpReminderDialog({ open, items, onDismiss }: Props) {
  if (!open || items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-hidden onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-up-reminder-title"
        className="relative z-[101] w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 id="follow-up-reminder-title" className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Tracker follow-up
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Today is a scheduled tracker day for your project(s). We don&apos;t see a send from you yet (subject should include{" "}
          <span className="font-medium">tracker</span> and the <span className="font-medium">project name</span>).
        </p>
        <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-neutral-800 dark:text-neutral-200">
          {items.map((r) => (
            <li key={r.projectId}>
              <span className="font-medium">{r.projectName}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/follow-up" className={cn(buttonVariants(), "flex-1 text-center")}>
            Open Follow UP
          </Link>
          <Button type="button" variant="outline" className="flex-1" onClick={onDismiss}>
            Dismiss for today
          </Button>
        </div>
      </div>
    </div>
  );
}
