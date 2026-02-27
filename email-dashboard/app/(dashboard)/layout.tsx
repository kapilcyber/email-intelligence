"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const env = process.env.NEXT_PUBLIC_ENV ?? "Dev";
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar environment={env} />
        <main className="flex-1 overflow-auto bg-[#F8F9FA] p-4 md:p-6 dark:bg-neutral-950">{children}</main>
      </div>
    </div>
  );
}
