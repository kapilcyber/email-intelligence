"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({
  value,
  onValueChange,
  children,
  className,
  placeholder,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selectedLabel = React.Children.toArray(children).find(
    (c): c is React.ReactElement<{ value: string; children: React.ReactNode }> =>
      React.isValidElement(c) && (c.props as { value?: string }).value === value
  );
  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-950",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        )}
      >
        <span className={value ? "" : "text-neutral-500"}>{selectedLabel ? (selectedLabel.props as { children: React.ReactNode }).children : placeholder ?? "Select"}</span>
        <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-neutral-200 bg-white py-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900">
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            const props = child.props as { value: string; children: React.ReactNode };
            if (!("value" in props)) return child;
            return (
              <div
                role="option"
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800",
                  value === props.value && "bg-neutral-100 dark:bg-neutral-800"
                )}
                onClick={() => {
                  onValueChange?.(props.value);
                  setOpen(false);
                }}
              >
                {props.children}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <>{children}</>;
}
