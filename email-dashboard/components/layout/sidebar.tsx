"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Mail,
  FolderOpen,
  List,
  PanelLeftClose,
  PanelLeft,
  CreditCard,
  Plus,
  Users,
  Network,
  AlertCircle,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getApi } from "@/lib/api/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/emails", label: "History", icon: Mail },
  { href: "/departments", label: "Inbox", icon: FolderOpen },
  { href: "/escalations", label: "Escalations", icon: AlertCircle },
];

const adminNavItems = [
  { href: "/admin/teams", label: "Teams", icon: Users },
  { href: "/admin/team-leaders", label: "Team leaders", icon: UserCircle },
  { href: "/admin/workflow", label: "Workflow", icon: Network },
  { href: "/admin/escalations", label: "Escalations", icon: AlertCircle },
  { href: "/admin/leads", label: "Leads", icon: List },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const adminEmailsEnv = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "") : (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "");
  const adminEmailsList = useMemo(() => adminEmailsEnv.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean), [adminEmailsEnv]);
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) {
      setIsAdmin(false);
      return;
    }
    const userEmail = (session.user.email ?? "").trim().toLowerCase();
    const isInEnvList = adminEmailsList.length > 0 && adminEmailsList.includes(userEmail);
    api.getMe().then((r) => setIsAdmin(r.isAdmin || isInEnvList)).catch(() => setIsAdmin(isInEnvList));
  }, [status, session?.user?.email, api, adminEmailsList]);
  const name = session?.user?.name ?? session?.user?.email ?? "User";
  const email = session?.user?.email ?? "";
  const initial = name.charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-neutral-200 bg-[#F8F9FA] transition-[width] duration-200 dark:border-neutral-700 dark:bg-neutral-900/50",
        collapsed ? "w-[4rem]" : "w-64"
      )}
    >
      {/* User profile */}
      <div className={cn("border-b border-neutral-200 dark:border-neutral-700", collapsed ? "p-2" : "p-4")}>
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E1E1E] text-sm font-medium text-white dark:bg-neutral-700">
              {session?.user?.image ? (
                <img src={session.user.image} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{name}</p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{email}</p>
            </div>
            <button type="button" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300" aria-label="Profile">
              <CreditCard className="h-5 w-5" />
            </button>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <div className="h-9 w-9 rounded-full bg-[#1E1E1E] flex items-center justify-center text-sm font-medium text-white">
              {initial}
            </div>
          </div>
        )}
      </div>

      {/* Create Task */}
      {!collapsed && (
        <div className="p-3">
          <Link href="/dashboard">
            <Button className="w-full justify-center gap-2 rounded-lg bg-[#1E1E1E] text-white hover:bg-[#2d2d2d] dark:bg-neutral-800 dark:hover:bg-neutral-700">
              <Plus className="h-4 w-4" />
              Create Task
            </Button>
          </Link>
        </div>
      )}

      {/* Main nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2 overflow-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
        {isAdmin && (
          <>
            {!collapsed && (
              <p className="mt-3 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Admin
              </p>
            )}
            {adminNavItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Collapse */}
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 flex w-full items-center justify-center rounded-lg py-2 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
    </aside>
  );
}
