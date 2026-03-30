"use client";

import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MomPromptHost } from "@/components/meetings/mom-prompt-host";
import { FollowUpReminderHost } from "@/components/follow-up/follow-up-reminder-host";
import { ToggleWalkthrough } from "@/components/tour/toggle-walkthrough";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const env = process.env.NEXT_PUBLIC_ENV ?? "Dev";

  useEffect(() => {
    if (!mainRef.current || !contentRef.current) return;

    const lenis = new Lenis({
      wrapper: mainRef.current,
      content: contentRef.current,
      duration: 1,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.2,
    });

    let frameId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frameId = window.requestAnimationFrame(raf);
    };
    frameId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-app-gradient">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar environment={env} />
        <main ref={mainRef} className="flex-1 overflow-auto bg-app-gradient p-4 md:p-6">
          <div ref={contentRef} className="min-h-full">
            {children}
          </div>
        </main>
        <ToggleWalkthrough />
        <MomPromptHost />
        <FollowUpReminderHost />
      </div>
    </div>
  );
}
