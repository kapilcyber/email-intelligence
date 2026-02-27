"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Calendar, Search, Moon, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SystemStatus } from "@/lib/types";

const pathToLabel: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/emails": "History",
  "/departments": "Departments",
  "/queue": "Queue",
  "/settings": "Settings",
  "/profile": "Profile",
  "/webhook": "Webhook",
};

function getPageLabel(pathname: string): string {
  for (const [path, label] of Object.entries(pathToLabel)) {
    if (pathname === path || (path !== "/dashboard" && pathname.startsWith(path))) return label;
  }
  return "Dashboard";
}

export function Topbar({ environment = "Dev" }: { systemStatus?: SystemStatus; environment?: string }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const pageLabel = getPageLabel(pathname);

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2">
        <Calendar className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Email Intelligence</span>
          <span className="text-neutral-400 dark:text-neutral-500">&gt;</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{pageLabel}</span>
        </nav>
      </div>

      {/* Search */}
      <div className="hidden flex-1 max-w-md md:flex">
        <div className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800/50">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            type="search"
            placeholder="Search projects..."
            className="min-w-0 flex-1 bg-transparent text-neutral-900 placeholder-neutral-500 outline-none dark:text-neutral-100 dark:placeholder-neutral-400"
            readOnly
            aria-label="Search"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-lg" aria-label="Toggle theme">
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: "/signin" })} className="rounded-lg" aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
