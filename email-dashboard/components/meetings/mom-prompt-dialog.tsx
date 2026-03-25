"use client";

import type { CalendarEventOut } from "@/lib/types";
import { inferMeetingType } from "@/lib/mom-storage";
import { formatMomTimeRange } from "@/lib/mom-eligibility";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  event: CalendarEventOut | null;
  onMarkSent: () => void;
  onRemindTenMinutes: () => void;
  onNotApplicable: () => void;
};

export function MomPromptDialog({ open, event, onMarkSent, onRemindTenMinutes, onNotApplicable }: Props) {
  if (!open || !event) return null;

  const type = inferMeetingType(event);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-hidden
        onClick={(e) => e.stopPropagation()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mom-dialog-title"
        className="relative z-[101] w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 id="mom-dialog-title" className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Send minutes of meeting (MOM)?
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          This meeting has ended. Let us know if you have sent the MOM to attendees.
        </p>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="font-medium text-neutral-900 dark:text-neutral-100">{event.subject || "(No subject)"}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatMomTimeRange(event)}</p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Type · {type}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" className="flex-1" onClick={onMarkSent}>
            Done — MOM sent
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onRemindTenMinutes}>
            Later (10 minutes)
          </Button>
        </div>
        <button
          type="button"
          onClick={onNotApplicable}
          className="mt-3 w-full text-center text-xs text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-300"
        >
          Not applicable — do not ask again
        </button>
      </div>
    </div>
  );
}
