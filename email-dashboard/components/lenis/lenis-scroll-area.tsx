"use client";

import * as React from "react";
import { useLayoutEffect, useRef, useContext, createContext } from "react";
import Lenis from "lenis";
import { cn } from "@/lib/utils";
import { LENIS_SHARED_OPTS } from "@/lib/lenis-options";

/** Register extra Lenis instances to the dashboard RAF loop (main + sidebar already run there). */
export const DashboardExtraLenisContext = createContext<((instance: Lenis) => () => void) | null>(null);

export type LenisScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Applied to the inner content wrapper (Lenis `content` element). */
  contentClassName?: string;
  axis?: "vertical" | "horizontal";
};

/**
 * Smooth scroll via Lenis for an internal scrollport. Requires {@link DashboardExtraLenisContext}
 * (dashboard layout); otherwise falls back to a plain overflow div.
 */
export function LenisScrollArea({
  className,
  contentClassName,
  axis = "vertical",
  children,
  ...rest
}: LenisScrollAreaProps) {
  const register = useContext(DashboardExtraLenisContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!register) return;
    const w = wrapperRef.current;
    const c = contentRef.current;
    if (!w || !c) return;

    const isHorizontal = axis === "horizontal";
    const lenis = new Lenis({
      ...LENIS_SHARED_OPTS,
      wrapper: w,
      content: c,
      orientation: isHorizontal ? "horizontal" : "vertical",
      gestureOrientation: isHorizontal ? "horizontal" : "vertical",
    });

    const unregister = register(lenis);
    const ro = new ResizeObserver(() => lenis.resize());
    ro.observe(w);
    ro.observe(c);

    return () => {
      ro.disconnect();
      unregister();
      lenis.destroy();
    };
  }, [register, axis]);

  const overflow =
    axis === "horizontal"
      ? "overflow-x-auto overflow-y-hidden"
      : "overflow-y-auto overflow-x-hidden";

  if (!register) {
    return (
      <div className={cn("min-h-0 min-w-0", overflow, className)} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cn("min-h-0 min-w-0", overflow, className)} {...rest}>
      <div ref={contentRef} className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
