"use client";

import { Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { LENIS_SHARED_OPTS } from "@/lib/lenis-options";
import { DashboardExtraLenisContext } from "@/components/lenis/lenis-scroll-area";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RoleChangeSessionGuard } from "@/components/layout/role-change-toast";
import { MomPromptHost } from "@/components/meetings/mom-prompt-host";
import { FollowUpReminderHost } from "@/components/follow-up/follow-up-reminder-host";
import { ToggleWalkthrough } from "@/components/tour/toggle-walkthrough";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  const sidebarNavContentRef = useRef<HTMLDivElement | null>(null);
  const extraLenisRef = useRef<Set<Lenis>>(new Set());
  const registerExtraLenis = useCallback((instance: Lenis) => {
    extraLenisRef.current.add(instance);
    return () => {
      extraLenisRef.current.delete(instance);
    };
  }, []);
  const env = process.env.NEXT_PUBLIC_ENV ?? "Dev";

  useLayoutEffect(() => {
    const mainEl = mainRef.current;
    const mainContent = contentRef.current;
    const sideNav = sidebarNavRef.current;
    const sideContent = sidebarNavContentRef.current;
    if (!mainEl || !mainContent || !sideNav || !sideContent) return;

    const lenisMain = new Lenis({
      ...LENIS_SHARED_OPTS,
      wrapper: mainEl,
      content: mainContent,
    });
    const lenisSidebar = new Lenis({
      ...LENIS_SHARED_OPTS,
      wrapper: sideNav,
      content: sideContent,
    });

    let frameId = 0;
    const raf = (time: number) => {
      lenisMain.raf(time);
      lenisSidebar.raf(time);
      extraLenisRef.current.forEach((l) => l.raf(time));
      frameId = window.requestAnimationFrame(raf);
    };
    frameId = window.requestAnimationFrame(raf);

    const resizeBoth = () => {
      lenisMain.resize();
      lenisSidebar.resize();
    };
    window.addEventListener("resize", resizeBoth);

    /** Debounce RO: sidebar width CSS transition fires many observer callbacks; Lenis.resize each frame causes jank. */
    let roDebounce: number | null = null;
    const ro = new ResizeObserver(() => {
      if (roDebounce != null) clearTimeout(roDebounce);
      roDebounce = window.setTimeout(() => {
        roDebounce = null;
        resizeBoth();
      }, 48);
    });
    ro.observe(mainEl);
    ro.observe(sideNav);
    resizeBoth();

    return () => {
      if (roDebounce != null) clearTimeout(roDebounce);
      ro.disconnect();
      window.removeEventListener("resize", resizeBoth);
      window.cancelAnimationFrame(frameId);
      lenisMain.destroy();
      lenisSidebar.destroy();
    };
  }, []);

  return (
    <DashboardExtraLenisContext.Provider value={registerExtraLenis}>
      <div className="flex h-screen overflow-hidden bg-app-gradient">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          navScrollRef={sidebarNavRef}
          navScrollContentRef={sidebarNavContentRef}
        />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <header
              className="glass-surface-strong flex h-16 shrink-0 items-center border-b px-4"
              aria-hidden
            />
          }
        >
          <Topbar environment={env} />
        </Suspense>
        <RoleChangeSessionGuard />
        <main ref={mainRef} className="flex-1 overflow-auto bg-app-gradient p-4 md:p-6">
          <div ref={contentRef} className="min-h-full">
            {children}
          </div>
        </main>
        <Suspense fallback={null}>
          <ToggleWalkthrough />
        </Suspense>
        <MomPromptHost />
        <FollowUpReminderHost />
      </div>
    </div>
    </DashboardExtraLenisContext.Provider>
  );
}
