"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function getItemsFromChildren(children: React.ReactNode): Array<{ value: string; label: React.ReactNode }> {
  const items: Array<{ value: string; label: React.ReactNode }> = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && (child.props as { value?: string }).value !== undefined) {
      items.push({
        value: (child.props as { value: string }).value,
        label: (child.props as { children: React.ReactNode }).children,
      });
    }
  });
  return items;
}

function isCompoundStructure(children: React.ReactNode): boolean {
  let hasTrigger = false;
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && (child.type as { displayName?: string })?.displayName === "SelectTrigger") {
      hasTrigger = true;
    }
  });
  return hasTrigger;
}

export function Select({
  value,
  onValueChange,
  children,
  className,
  placeholder,
  disabled,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const compound = isCompoundStructure(children);
  let triggerClassName = "";
  let valuePlaceholder = placeholder;
  let items: Array<{ value: string; label: React.ReactNode }> = [];

  if (compound) {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const type = child.type as { displayName?: string };
      if (type?.displayName === "SelectTrigger") {
        triggerClassName = (child.props as { className?: string }).className ?? "";
        React.Children.forEach((child.props as { children?: React.ReactNode }).children, (sub) => {
          if (React.isValidElement(sub) && (sub.type as { displayName?: string })?.displayName === "SelectValue") {
            valuePlaceholder = (sub.props as { placeholder?: string }).placeholder ?? valuePlaceholder;
          }
        });
      } else if (type?.displayName === "SelectContent") {
        items = getItemsFromChildren((child.props as { children?: React.ReactNode }).children);
      }
    });
  } else {
    items = getItemsFromChildren(children);
  }

  const selectedItem = items.find((i) => i.value === value);
  const displayLabel = selectedItem ? selectedItem.label : valuePlaceholder ?? "Select";

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
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-border bg-panel px-3 py-2 text-sm text-foreground shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          compound && triggerClassName
        )}
      >
        <span className={value ? "" : "text-muted-foreground"}>{displayLabel}</span>
        <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-panel py-1 shadow-md">
          {items.map((item) => (
            <div
              key={item.value}
              role="option"
              className={cn(
                "cursor-pointer px-3 py-2 text-sm hover:bg-muted",
                value === item.value && "bg-muted"
              )}
              onClick={() => {
                onValueChange?.(item.value);
                setOpen(false);
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SelectTrigger({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <>{children}</>;
}
SelectTrigger.displayName = "SelectTrigger";

export function SelectContent({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
SelectContent.displayName = "SelectContent";

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return null;
}
SelectValue.displayName = "SelectValue";

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <>{children}</>;
}
