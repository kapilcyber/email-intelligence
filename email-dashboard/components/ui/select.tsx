"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";

const SELECT_MENU_Z = 500;

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

function computeMenuPosition(triggerEl: HTMLElement): { top: number; left: number; width: number; maxHeight: number } {
  const rect = triggerEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 4;
  const desiredMax = 280;
  const spaceBelow = vh - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  let top: number;
  let maxHeight: number;
  if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
    top = rect.bottom + gap;
    maxHeight = Math.min(desiredMax, Math.max(80, spaceBelow));
  } else {
    maxHeight = Math.min(desiredMax, Math.max(80, spaceAbove));
    top = rect.top - gap - maxHeight;
  }
  let left = rect.left;
  const width = Math.max(rect.width, 120);
  if (left + width > vw - 8) {
    left = Math.max(8, vw - width - 8);
  }
  if (left < 8) left = 8;
  return { top, left, width, maxHeight };
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
  const [mounted, setMounted] = React.useState(false);
  const [menuBox, setMenuBox] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );
  const ref = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

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

  const updateMenuPosition = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setMenuBox(computeMenuPosition(el));
  }, []);

  React.useEffect(() => setMounted(true), []);

  React.useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const menu =
    mounted &&
    open &&
    menuBox &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        className="fixed flex flex-col overflow-hidden rounded-md border border-border bg-panel text-foreground shadow-lg outline-none"
        style={{
          top: menuBox.top,
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: menuBox.maxHeight,
          zIndex: SELECT_MENU_Z,
        }}
      >
        <LenisScrollArea className="min-h-0 max-h-full w-full" contentClassName="py-1">
          {items.map((item) => (
            <div
              key={item.value}
              role="option"
              aria-selected={value === item.value}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm text-foreground hover:bg-muted",
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
        </LenisScrollArea>
      </div>,
      document.body
    );

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
      {menu}
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
SelectItem.displayName = "SelectItem";
