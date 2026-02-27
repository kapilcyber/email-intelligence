"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Mail,
  FolderOpen,
  ListTodo,
  Settings,
  PanelLeftClose,
  PanelLeft,
  CreditCard,
  ChevronUp,
  List,
  MoreHorizontal,
  Plus,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/emails", label: "History", icon: Mail },
  { href: "/departments", label: "Inbox", icon: FolderOpen },
  { href: "/queue", label: "Queue", icon: ListTodo },
  { href: "/settings", label: "Settings", icon: Settings },
];

const favouritePlaceholders = [
  "Dashboard — Overview",
  "Emails — Inbox",
  "Queue — Monitor",
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
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
      <nav className="flex-1 space-y-0.5 px-3 py-2">
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
      </nav>

      {/* Favourite */}
      {!collapsed && (
        <div className="border-t border-neutral-200 px-3 py-3 dark:border-neutral-700">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Favourite <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700" aria-label="Add">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-1">
            {favouritePlaceholders.slice(0, 2).map((item, i) => (
              <li key={i} className="flex items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-xs text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700">
                <List className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate">{item}</span>
                <button type="button" className="shrink-0 rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-600" aria-label="More">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Help Center & collapse */}
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
        {!collapsed && (
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            <HelpCircle className="h-4 w-4" />
            Help Center
          </Link>
        )}
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
