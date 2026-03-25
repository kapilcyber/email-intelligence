"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { Calendar, Search, Moon, Sun, LogOut, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import type { NotificationItem, SystemStatus } from "@/lib/types";

const pathToLabel: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/emails": "History",
  "/departments": "Departments",
  "/escalations": "Escalations",
  "/leads": "Leads",
  "/retag": "ReTag",
  "/profile": "Profile",
  "/webhook": "Webhook",
  "/threads": "Threads",
  "/admin/team-projects": "Projects",
};

function getPageLabel(pathname: string): string {
  const deptMatch = pathname.match(/^\/departments\/([^/]+)\/?$/);
  if (deptMatch) {
    const seg = deptMatch[1];
    if (seg.toLowerCase() === "all") return "Departments · All";
    const pretty = seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
    return `Departments · ${pretty}`;
  }
  if (pathname === "/departments") return "Departments";
  for (const [path, label] of Object.entries(pathToLabel)) {
    if (pathname === path || (path !== "/dashboard" && pathname.startsWith(path))) return label;
  }
  return "Dashboard";
}

export function Topbar({ environment = "Dev" }: { systemStatus?: SystemStatus; environment?: string }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const pageLabel = getPageLabel(pathname);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    api
      .getNotifications()
      .then((r) => setItems(r.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    loadNotifications();
    const id = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(id);
  }, [status, api]);

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
            placeholder="Search threads..."
            className="min-w-0 flex-1 bg-transparent text-neutral-900 placeholder-neutral-500 outline-none dark:text-neutral-100 dark:placeholder-neutral-400"
            readOnly
            aria-label="Search"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-1">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg"
            aria-label="Notifications"
            onClick={() => {
              setOpen((v) => !v);
              if (!open) loadNotifications();
            }}
          >
            <Bell className="h-4 w-4" />
            {items.length > 0 && (
              <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                {items.length > 9 ? "9+" : items.length}
              </span>
            )}
          </Button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Notifications</p>
                <button type="button" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={loadNotifications}>
                  Refresh
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loading && items.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">No notifications</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {items.map((n) => (
                      <li key={n.id} className="px-3 py-2">
                        {n.href ? (
                          <Link href={n.href} className="block" onClick={() => setOpen(false)}>
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{n.title}</p>
                            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{n.message}</p>
                          </Link>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{n.title}</p>
                            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{n.message}</p>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
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
