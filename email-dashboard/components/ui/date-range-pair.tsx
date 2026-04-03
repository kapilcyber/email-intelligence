"use client";

import { cn } from "@/lib/utils";

type Props = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
  /** Wrapper around each field; default suits filter toolbars. */
  fieldClassName?: string;
};

/**
 * Two native date inputs with visible From / To labels (hides empty-field dd/mm/yyyy via `date-range-label-empty` in globals.css).
 */
export function DateRangePair({
  from,
  to,
  onFromChange,
  onToChange,
  className,
  fieldClassName,
}: Props) {
  const fieldWrap = fieldClassName ?? "relative min-w-0 flex-1 sm:w-36 sm:flex-none";
  const inputBase =
    "date-range-input h-10 min-w-0 w-full rounded-lg border border-border bg-panel py-2 text-sm text-foreground shadow-sm " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className={fieldWrap}>
        {!from && (
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-muted-foreground">
            From
          </span>
        )}
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className={cn(
            inputBase,
            from ? "px-3" : "pl-[3.25rem] pr-3 date-range-label-empty"
          )}
          aria-label="From date"
        />
      </div>
      <div className={fieldWrap}>
        {!to && (
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-muted-foreground">
            To
          </span>
        )}
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className={cn(
            inputBase,
            to ? "px-3" : "pl-[3.25rem] pr-3 date-range-label-empty"
          )}
          aria-label="To date"
        />
      </div>
    </div>
  );
}
