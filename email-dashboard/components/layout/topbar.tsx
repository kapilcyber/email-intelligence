"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { Calendar, Search, Moon, Sun, LogOut, Bell, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
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
  "/admin": "Admin",
  "/admin/tracker": "Tracker",
  "/admin/review": "Review",
  "/follow-up": "Follow UP",
  "/how-to-use": "How to use",
};

function prettifySegment(seg: string): string {
  if (!seg) return "";
  const v = decodeURIComponent(seg).replace(/[-_]/g, " ").trim();
  if (!v) return "";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function toEmailDisplayNumber(rawId: string): string {
  const normalized = (rawId || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (!normalized) return "Email";
  const seed = normalized.slice(0, 12);
  const n = Number.parseInt(seed, 16);
  if (!Number.isFinite(n) || Number.isNaN(n)) return "Email";
  const unique = (n % 900000) + 100000;
  return `Email #${unique}`;
}

type BreadcrumbItem = { label: string; href: string };

function buildBreadcrumbItems(pathname: string, trackerProjectLabel: string | null): BreadcrumbItem[] {
  if (!pathname || pathname === "/") {
    return [{ label: "Dashboard", href: "/dashboard" }];
  }

  const norm = pathname.replace(/\/$/, "") || "/";

  const deptMatch = norm.match(/^\/departments\/([^/]+)$/);
  if (deptMatch) {
    const seg = deptMatch[1];
    const secondLabel = seg.toLowerCase() === "all" ? "All" : prettifySegment(seg);
    return [
      { label: "Departments", href: "/departments/all" },
      { label: secondLabel, href: norm },
    ];
  }

  const segments = norm.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ label: "Dashboard", href: "/dashboard" }];
  }

  const items: BreadcrumbItem[] = [];
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    acc += `/${seg}`;
    let href = acc;
    if (href === "/departments") {
      href = "/departments/all";
    }
    let label = pathToLabel[acc];
    if (!label) {
      if (acc === norm && norm.startsWith("/admin/tracker/") && trackerProjectLabel) {
        label = trackerProjectLabel;
      } else if (acc === norm && norm.startsWith("/emails/")) {
        label = toEmailDisplayNumber(seg);
      } else {
        label = prettifySegment(seg);
      }
    }
    items.push({ label, href });
  }
  return items;
}

export function Topbar({ environment = "Dev" }: { systemStatus?: SystemStatus; environment?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [trackerProjectLabel, setTrackerProjectLabel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const breadcrumbItems = useMemo(
    () => buildBreadcrumbItems(pathname, trackerProjectLabel),
    [pathname, trackerProjectLabel]
  );

  const loadNotifications = () => {
    if (status !== "authenticated") return;
    setLoading(true);
    api
      .getNotifications()
      .then((r) => setItems(r.items ?? []))
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    loadNotifications();
    const id = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(id);
  }, [status, api]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const m = pathname.match(/^\/admin\/tracker\/([^/]+)$/);
    if (!m) {
      setTrackerProjectLabel(null);
      return;
    }
    const projectId = decodeURIComponent(m[1]);
    api
      .getAdminTrackerProjectEmails(projectId, { days: 30, limit: 1 })
      .then((r) => {
        const name = (r.projectName || "").trim();
        setTrackerProjectLabel(name || "Project");
      })
      .catch(() => setTrackerProjectLabel("Project"));
  }, [pathname, status, api]);

  useEffect(() => {
    const q = (searchParams.get("search") ?? "").trim();
    if (pathname === "/emails") {
      setSearchQuery(q);
    }
  }, [pathname, searchParams]);

  const submitTopbarSearch = () => {
    const q = searchQuery.trim();
    router.push(q ? `/emails?search=${encodeURIComponent(q)}` : "/emails");
  };

  return (
    <header className="glass-surface-strong flex h-14 items-center justify-between gap-4 border-b px-4">
      {/* Back + Breadcrumbs */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-lg"
          aria-label="Go back"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <nav className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm" aria-label="Breadcrumb">
          <Link
            href="/dashboard"
            className="shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Email Intelligence
          </Link>
          {breadcrumbItems.map((item, idx) => (
            <span key={`${item.href}-${idx}`} className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-muted-foreground/70" aria-hidden>
                &gt;
              </span>
              <Link
                href={item.href}
                className={cn(
                  "min-w-0 truncate underline-offset-2 hover:underline",
                  idx === breadcrumbItems.length - 1
                    ? "font-medium text-foreground hover:text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>

      {/* Search */}
      <div className="hidden flex-1 max-w-md md:flex">
        <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm">
          <button
            type="button"
            onClick={submitTopbarSearch}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Run search"
          >
            <Search className="h-4 w-4" />
          </button>
          <input
            type="search"
            placeholder="Search emails..."
            className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitTopbarSearch();
              }
            }}
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
            <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-lg border border-border bg-panel shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
                <button type="button" className="text-xs text-accent hover:underline" onClick={loadNotifications}>
                  Refresh
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loading && items.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No notifications</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((n) => (
                      <li key={n.id} className="px-3 py-2">
                        {n.href ? (
                          <Link href={n.href} className="block" onClick={() => setOpen(false)}>
                            <p className="text-sm font-medium text-foreground">{n.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                          </Link>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-foreground">{n.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
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
        <Button
          variant="ghost"
          size="icon"
          onClick={async () => {
            try {
              await api.recordLogout();
            } catch {
              // Best-effort logout audit; sign out regardless.
            }
            void signOut({ callbackUrl: "/signin" });
          }}
          className="rounded-lg"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
