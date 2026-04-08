"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";
import { cn } from "@/lib/utils";

const DROPDOWN_Z = 500;

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined | null>) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(value);
      else if (ref && typeof ref === "object" && "current" in ref) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    });
  };
}

function computeDropdownPosition(
  triggerEl: HTMLElement,
  align: "start" | "end",
  minWidthPx: number
): { top: number; left: number; width: number; maxHeight: number } {
  const rect = triggerEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 4;
  const desiredMax = 320;
  const spaceBelow = vh - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  let top: number;
  let maxHeight: number;
  if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
    top = rect.bottom + gap;
    maxHeight = Math.min(desiredMax, Math.max(80, spaceBelow));
  } else {
    maxHeight = Math.min(desiredMax, Math.max(80, spaceAbove));
    top = rect.top - gap - maxHeight;
  }
  const width = Math.max(rect.width, minWidthPx);
  let left = align === "end" ? rect.right - width : rect.left;
  if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
  if (left < 8) left = 8;
  return { top, left, width, maxHeight };
}

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
};

const DropdownMenuContext = React.createContext<Ctx | null>(null);

export function DropdownMenu({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback(
    (v: boolean) => {
      onOpenChange?.(v);
      if (controlledOpen === undefined) setInternalOpen(v);
    },
    [controlledOpen, onOpenChange]
  );
  const value = React.useMemo(() => ({ open, setOpen, triggerRef }), [open, setOpen]);
  return <DropdownMenuContext.Provider value={value}>{children}</DropdownMenuContext.Provider>;
}

export function DropdownMenuTrigger({
  children,
  className,
  asChild,
}: {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) return null;
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    ctx.setOpen(!ctx.open);
  };
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
      className?: string;
      ref?: React.Ref<HTMLElement>;
    }>;
    return React.cloneElement(child, {
      ref: mergeRefs(child.props.ref, ctx.triggerRef),
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        handleClick(e);
      },
      className: cn(className, child.props.className),
    });
  }
  return (
    <button
      ref={ctx.triggerRef as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={handleClick}
      className={className}
      aria-expanded={ctx.open}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  className,
  align = "end",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end";
}) {
  const ctx = React.useContext(DropdownMenuContext);
  const [mounted, setMounted] = React.useState(false);
  const [menuBox, setMenuBox] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  const updatePosition = React.useCallback(() => {
    const el = ctx?.triggerRef.current;
    if (!el) return;
    setMenuBox(computeDropdownPosition(el, align, 8 * 16));
  }, [ctx?.triggerRef, align]);

  React.useLayoutEffect(() => {
    if (!ctx?.open) {
      setMenuBox(null);
      return;
    }
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [ctx?.open, updatePosition]);

  React.useEffect(() => {
    if (!ctx?.open) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ctx.triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      ctx.setOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [ctx]);

  if (!ctx?.open || !mounted) return null;

  const portal =
    menuBox &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        className={cn(
          "fixed flex flex-col overflow-hidden rounded-xl border border-border bg-panel text-foreground shadow-lg outline-none backdrop-blur-md",
          className
        )}
        style={{
          top: menuBox.top,
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: menuBox.maxHeight,
          zIndex: DROPDOWN_Z,
        }}
      >
        <LenisScrollArea className="min-h-0 max-h-full w-full" contentClassName="py-1">
          {children}
        </LenisScrollArea>
      </div>,
      document.body
    );

  return portal;
}

export function DropdownMenuItem({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const ctx = React.useContext(DropdownMenuContext);
  return (
    <div
      role="menuitem"
      className={cn(
        "relative flex cursor-pointer select-none items-center px-2 py-1.5 text-sm text-foreground outline-none hover:bg-muted",
        className
      )}
      onClick={() => {
        onClick?.();
        ctx?.setOpen(false);
      }}
    >
      {children}
    </div>
  );
}
