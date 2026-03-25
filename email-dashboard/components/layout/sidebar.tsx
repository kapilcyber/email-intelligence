"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  Users,
  Network,
  AlertCircle,
  UserCircle,
  MessageSquare,
  FolderKanban,
  Tags,
  ClipboardList,
  ChevronRight,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApi } from "@/lib/api/client";
import { DEPARTMENT_CATEGORIES } from "@/lib/departments";
import { teamNameToSlug } from "@/lib/team-routes";
import type { TeamOut } from "@/lib/types";

const navItemsTop = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/emails", label: "History", icon: Mail },
  { href: "/threads", label: "Threads", icon: MessageSquare },
];

const navItemsAfterDepartments = [
  { href: "/escalations", label: "Escalations", icon: AlertCircle },
  { href: "/leads", label: "Leads", icon: List },
  { href: "/retag", label: "ReTag", icon: Tags },
  { href: "/mom", label: "MOM", icon: ClipboardList },
];

const adminNavItems = [
  { href: "/admin/team-leaders", label: "Team leaders", icon: UserCircle },
  { href: "/admin/team-projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/workflow", label: "Workflow", icon: Network },
  { href: "/admin/escalations", label: "Escalations", icon: AlertCircle },
  { href: "/admin/leads", label: "Leads", icon: List },
];

function DepartmentsNavSection({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const underDepartments = pathname.startsWith("/departments");
  const [accordionOpen, setAccordionOpen] = useState(underDepartments);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalEmails, setTotalEmails] = useState(0);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (underDepartments) setAccordionOpen(true);
  }, [underDepartments]);

  useEffect(() => {
    if (status !== "authenticated") return;
    api
      .getDashboardMetrics()
      .then((m) => {
        setCategoryCounts(m.categoryCounts ?? {});
        setTotalEmails(m.totalEmails ?? 0);
      })
      .catch(() => {});
  }, [status, api]);

  useEffect(() => {
    if (!flyoutOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (flyoutRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    };
    const tid = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [flyoutOpen]);

  const subLinks: { slug: string; label: string; count: number }[] = [
    { slug: "all", label: "All", count: totalEmails },
    ...DEPARTMENT_CATEGORIES.map((d) => ({
      slug: d.toLowerCase(),
      label: d,
      count: categoryCounts[d] ?? 0,
    })),
  ];

  const rowActive = underDepartments;

  if (collapsed) {
    return (
      <div className="relative flex justify-center px-1" ref={flyoutRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFlyoutOpen((o) => !o);
          }}
          className={cn(
            "flex w-full items-center justify-center rounded-lg p-2.5 transition-colors",
            rowActive || flyoutOpen
              ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
              : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          )}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          title="Departments"
        >
          <FolderOpen className="h-5 w-5 shrink-0" />
        </button>
        {flyoutOpen && (
          <div
            className="absolute left-full top-0 z-50 ml-1 min-w-[11rem] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            role="menu"
          >
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              Departments
            </p>
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {subLinks.map(({ slug, label, count }) => {
                const href = `/departments/${slug}`;
                const active = pathname === href;
                return (
                  <li key={slug}>
                    <Link
                      href={href}
                      role="menuitem"
                      onClick={() => setFlyoutOpen(false)}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                        active
                          ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                          : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/80"
                      )}
                    >
                      <span>{label}</span>
                      <span className="tabular-nums text-xs text-neutral-500">{count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setAccordionOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
          rowActive
            ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
            : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
        )}
        aria-expanded={accordionOpen}
      >
        <FolderOpen className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">Departments</span>
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200", accordionOpen && "rotate-90")}
          aria-hidden
        />
      </button>
      {accordionOpen && (
        <ul
          className="ml-2 space-y-0.5 border-l border-neutral-200 py-0.5 pl-2 dark:border-neutral-600"
          role="list"
        >
          {subLinks.map(({ slug, label, count }) => {
            const href = `/departments/${slug}`;
            const active = pathname === href;
            return (
              <li key={slug}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                    active
                      ? "bg-neutral-900 font-medium text-white dark:bg-neutral-600 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  )}
                >
                  <span className="truncate">{label}</span>
                  <span className="shrink-0 tabular-nums text-xs opacity-80">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TeamsNavSection({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const underTeams = pathname.startsWith("/teams");
  const [accordionOpen, setAccordionOpen] = useState(underTeams);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (underTeams) setAccordionOpen(true);
  }, [underTeams]);

  useEffect(() => {
    if (status !== "authenticated") return;
    api
      .getRetagDepartmentOptions()
      .then((r) => setTeamNames(r.departments ?? []))
      .catch(() => setTeamNames([]));
  }, [status, api]);

  useEffect(() => {
    if (!flyoutOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (flyoutRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    };
    const tid = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [flyoutOpen]);

  const sortedTeams = useMemo(
    () => [...teamNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [teamNames]
  );

  const rowActive = underTeams;

  if (collapsed) {
    return (
      <div className="relative flex justify-center px-1" ref={flyoutRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFlyoutOpen((o) => !o);
          }}
          className={cn(
            "flex w-full items-center justify-center rounded-lg p-2.5 transition-colors",
            rowActive || flyoutOpen
              ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
              : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          )}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          title="Teams"
        >
          <Building2 className="h-5 w-5 shrink-0" />
        </button>
        {flyoutOpen && (
          <div
            className="absolute left-full top-0 z-50 ml-1 min-w-[11rem] max-w-[16rem] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            role="menu"
          >
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              Teams
            </p>
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              <li>
                <Link
                  href="/teams/all"
                  role="menuitem"
                  onClick={() => setFlyoutOpen(false)}
                  className={cn(
                    "block px-3 py-2 text-sm",
                    pathname === "/teams/all"
                      ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/80"
                  )}
                >
                  All
                </Link>
              </li>
              {sortedTeams.map((name) => {
                const slug = teamNameToSlug(name);
                const href = `/teams/${slug}`;
                const active = pathname === href;
                return (
                  <li key={name}>
                    <Link
                      href={href}
                      role="menuitem"
                      onClick={() => setFlyoutOpen(false)}
                      className={cn(
                        "block truncate px-3 py-2 text-sm",
                        active
                          ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                          : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/80"
                      )}
                      title={name}
                    >
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setAccordionOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
          rowActive
            ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
            : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
        )}
        aria-expanded={accordionOpen}
      >
        <Building2 className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">Teams</span>
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200", accordionOpen && "rotate-90")}
          aria-hidden
        />
      </button>
      {accordionOpen && (
        <ul
          className="ml-2 space-y-0.5 border-l border-neutral-200 py-0.5 pl-2 dark:border-neutral-600"
          role="list"
        >
          <li>
            <Link
              href="/teams/all"
              className={cn(
                "block truncate rounded-md px-2 py-2 text-sm transition-colors",
                pathname === "/teams/all"
                  ? "bg-neutral-900 font-medium text-white dark:bg-neutral-600 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
              )}
            >
              All
            </Link>
          </li>
          {sortedTeams.map((name) => {
            const slug = teamNameToSlug(name);
            const href = `/teams/${slug}`;
            const active = pathname === href;
            return (
              <li key={name}>
                <Link
                  href={href}
                  className={cn(
                    "block truncate rounded-md px-2 py-2 text-sm transition-colors",
                    active
                      ? "bg-neutral-900 font-medium text-white dark:bg-neutral-600 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  )}
                  title={name}
                >
                  {name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Admin: expandable Teams (same pattern as Departments) — lists DB teams, links to overview + detail. */
function AdminTeamsNavSection({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const underAdminTeams = pathname === "/admin/teams" || pathname.startsWith("/admin/teams/");
  const [accordionOpen, setAccordionOpen] = useState(underAdminTeams);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [teams, setTeams] = useState<TeamOut[]>([]);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (underAdminTeams) setAccordionOpen(true);
  }, [underAdminTeams]);

  useEffect(() => {
    if (status !== "authenticated") return;
    api.getTeams().then(setTeams).catch(() => setTeams([]));
  }, [status, api]);

  useEffect(() => {
    if (!flyoutOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (flyoutRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    };
    const tid = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [flyoutOpen]);

  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [teams]
  );

  const rowActive = underAdminTeams;

  if (collapsed) {
    return (
      <div className="relative flex justify-center px-1" ref={flyoutRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFlyoutOpen((o) => !o);
          }}
          className={cn(
            "flex w-full items-center justify-center rounded-lg p-2.5 transition-colors",
            rowActive || flyoutOpen
              ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
              : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          )}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          title="Teams (admin)"
        >
          <Users className="h-5 w-5 shrink-0" />
        </button>
        {flyoutOpen && (
          <div
            className="absolute left-full top-0 z-50 ml-1 min-w-[12rem] max-w-[18rem] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            role="menu"
          >
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              Teams
            </p>
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              <li>
                <Link
                  href="/admin/teams"
                  role="menuitem"
                  onClick={() => setFlyoutOpen(false)}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                    pathname === "/admin/teams"
                      ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/80"
                  )}
                >
                  <span>All teams</span>
                </Link>
              </li>
              {sorted.map((t) => {
                const href = `/admin/teams/${t.id}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={t.id}>
                    <Link
                      href={href}
                      role="menuitem"
                      onClick={() => setFlyoutOpen(false)}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                        active
                          ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                          : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/80"
                      )}
                      title={t.name}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0 tabular-nums text-xs text-neutral-500">{t.memberCount}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setAccordionOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
          rowActive
            ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
            : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
        )}
        aria-expanded={accordionOpen}
      >
        <Users className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">Teams</span>
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200", accordionOpen && "rotate-90")}
          aria-hidden
        />
      </button>
      {accordionOpen && (
        <ul
          className="ml-2 space-y-0.5 border-l border-neutral-200 py-0.5 pl-2 dark:border-neutral-600"
          role="list"
        >
          <li>
            <Link
              href="/admin/teams"
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                pathname === "/admin/teams"
                  ? "bg-neutral-900 font-medium text-white dark:bg-neutral-600 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
              )}
            >
              <span>All teams</span>
            </Link>
          </li>
          {sorted.map((t) => {
            const href = `/admin/teams/${t.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={t.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                    active
                      ? "bg-neutral-900 font-medium text-white dark:bg-neutral-600 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  )}
                  title={t.name}
                >
                  <span className="truncate">{t.name}</span>
                  <span className="shrink-0 tabular-nums text-xs opacity-80">{t.memberCount}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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

  const renderNavLink = (href: string, label: string, Icon: typeof LayoutDashboard) => {
    let active = false;
    if (href === "/dashboard") active = pathname === "/dashboard";
    else if (href === "/emails")
      active = pathname === "/emails" || pathname.startsWith("/emails/");
    else active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-[#1E1E1E] text-white dark:bg-neutral-700 dark:text-white"
            : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
          collapsed && "justify-center px-2"
        )}
        title={collapsed ? label : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-neutral-200 bg-[#F8F9FA] transition-[width] duration-200 dark:border-neutral-700 dark:bg-neutral-900/50",
        collapsed ? "w-[4rem]" : "w-64"
      )}
    >
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

      <nav className="flex-1 space-y-0.5 overflow-auto px-3 py-2">
        {navItemsTop.map(({ href, label, icon }) => renderNavLink(href, label, icon))}
        <DepartmentsNavSection collapsed={collapsed} />
        <TeamsNavSection collapsed={collapsed} />
        {navItemsAfterDepartments.map(({ href, label, icon }) => renderNavLink(href, label, icon))}
        {isAdmin && (
          <>
            {!collapsed && (
              <p className="mt-3 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Admin
              </p>
            )}
            <AdminTeamsNavSection collapsed={collapsed} />
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
                      : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

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
