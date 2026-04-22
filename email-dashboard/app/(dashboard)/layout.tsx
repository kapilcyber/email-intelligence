"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, mobileNavOpen]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, mobileNavOpen]);

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
        {isMobile && mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[550] bg-black/45 backdrop-blur-[1px] md:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          navScrollRef={sidebarNavRef}
          navScrollContentRef={sidebarNavContentRef}
          isMobile={isMobile}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <header
              className="glass-app-chrome flex min-h-16 shrink-0 items-center px-4 pt-[env(safe-area-inset-top,0px)]"
              aria-hidden
            />
          }
        >
          <Topbar
            environment={env}
            onOpenMobileNav={isMobile ? () => setMobileNavOpen(true) : undefined}
          />
        </Suspense>
        <RoleChangeSessionGuard />
        <main
          ref={mainRef}
          className="flex-1 overflow-auto bg-app-gradient pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pl-4 sm:pr-4 sm:pt-4 sm:pb-[max(1rem,env(safe-area-inset-bottom,0px))] md:pl-[max(1.5rem,env(safe-area-inset-left,0px))] md:pr-[max(1.5rem,env(safe-area-inset-right,0px))] md:pt-6 md:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
        >
          <div ref={contentRef} className="min-h-full min-w-0">
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
