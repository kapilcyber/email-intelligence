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
  Users,
  Network,
  AlertCircle,
  UserCircle,
  MessageSquare,
  FolderKanban,
  Tags,
  ClipboardList,
  ChevronRight,
  CalendarRange,
  ClipboardCheck,
  BellRing,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApi } from "@/lib/api/client";
import { ME_UPDATED_EVENT } from "@/lib/me-sync-events";
import { DEPARTMENT_CATEGORIES } from "@/lib/departments";
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
  { href: "/follow-up", label: "Follow UP", icon: BellRing },
  { href: "/how-to-use", label: "How to use", icon: BookOpen },
];

/** Shown to org Managers (and Admins). Excludes workflow, projects, approvals. */
const managerAdminNavItems = [
  { href: "/admin/my-projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/team-leaders", label: "Team leaders", icon: UserCircle },
  { href: "/admin/tracker", label: "Tracker", icon: CalendarRange },
  { href: "/admin/review", label: "Review", icon: ClipboardCheck },
  { href: "/admin/escalations", label: "Escalations", icon: AlertCircle },
  { href: "/admin/leads", label: "Leads", icon: List },
];

/** Full admin menu order (Projects / Workflow / Approvals only for Admin role or allow list). */
const adminNavItemsAll = [
  { href: "/admin/team-leaders", label: "Team leaders", icon: UserCircle },
  { href: "/admin/team-projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/archive-projects", label: "Archive Projects", icon: FolderOpen },
  { href: "/admin/temporary-team", label: "Temporary team", icon: Users },
  { href: "/admin/tracker", label: "Tracker", icon: CalendarRange },
  { href: "/admin/review", label: "Review", icon: ClipboardCheck },
  { href: "/admin/workflow", label: "Workflow", icon: Network },
  { href: "/admin/escalations", label: "Escalations", icon: AlertCircle },
  { href: "/admin/leads", label: "Leads", icon: List },
  { href: "/admin/approvals", label: "Approvals", icon: ShieldCheck },
];

const ADMIN_ONLY_HREFS = new Set([
  "/admin/team-projects",
  "/admin/workflow",
  "/admin/approvals",
]);

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
              ? "bg-black text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          title="Departments"
        >
          <FolderOpen className="h-5 w-5 shrink-0" />
        </button>
        {flyoutOpen && (
          <div
            className="absolute left-full top-0 z-50 ml-1 min-w-[11rem] rounded-xl border border-border bg-panel py-1 shadow-lg"
            role="menu"
          >
            <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      )}
                    >
                      <span>{label}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
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
            ? "bg-black text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
          className="ml-2 space-y-0.5 border-l border-border py-0.5 pl-2"
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
                    active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted"
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

/** Admin/Manager: expandable Teams filtered by allowed department when provided. */
function AdminTeamsNavSection({ collapsed, allowedDepartment }: { collapsed: boolean; allowedDepartment?: string | null }) {
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

  const sorted = useMemo(() => {
    const dep = (allowedDepartment ?? "").trim();
    const list = dep ? teams.filter((t) => (t.name ?? "").trim() === dep) : teams;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [teams, allowedDepartment]);

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
              ? "bg-black text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          title="Teams (admin)"
        >
          <Users className="h-5 w-5 shrink-0" />
        </button>
        {flyoutOpen && (
          <div
            className="absolute left-full top-0 z-50 ml-1 min-w-[12rem] max-w-[18rem] rounded-xl border border-border bg-panel py-1 shadow-lg"
            role="menu"
          >
            <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Teams
            </p>
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {!allowedDepartment && (
                <li>
                  <Link
                    href="/admin/teams"
                    role="menuitem"
                    onClick={() => setFlyoutOpen(false)}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                      pathname === "/admin/teams"
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )}
                  >
                    <span>All teams</span>
                  </Link>
                </li>
              )}
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
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      )}
                      title={t.name}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{t.memberCount}</span>
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
            ? "bg-black text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
          className="ml-2 space-y-0.5 border-l border-border py-0.5 pl-2"
          role="list"
        >
          {!allowedDepartment && (
            <li>
              <Link
                href="/admin/teams"
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  pathname === "/admin/teams"
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span>All teams</span>
              </Link>
            </li>
          )}
          {sorted.map((t) => {
            const href = `/admin/teams/${t.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={t.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                    active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted"
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
  const [isManagerRole, setIsManagerRole] = useState(false);
  const [managerDepartment, setManagerDepartment] = useState<string | null>(null);
  const adminEmailsEnv = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "") : (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "");
  const adminEmailsList = useMemo(() => adminEmailsEnv.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean), [adminEmailsEnv]);
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) {
      setIsAdmin(false);
      setIsManagerRole(false);
      setManagerDepartment(null);
      return;
    }
    const userEmail = (session.user.email ?? "").trim().toLowerCase();
    const isInEnvList = adminEmailsList.length > 0 && adminEmailsList.includes(userEmail);

    const loadMe = () => {
      api
        .getMe()
        .then((r) => {
          setIsAdmin(r.isAdmin || isInEnvList);
          setIsManagerRole((r.role ?? "").trim() === "Manager");
          setManagerDepartment((r.department ?? "").trim() || null);
        })
        .catch(() => {
          setIsAdmin(isInEnvList);
          setIsManagerRole(false);
          setManagerDepartment(null);
        });
    };

    loadMe();
    const onMeSync = () => loadMe();
    window.addEventListener(ME_UPDATED_EVENT, onMeSync);
    return () => window.removeEventListener(ME_UPDATED_EVENT, onMeSync);
  }, [status, session?.user?.email, api, adminEmailsList]);
  const showManagerAdminNav = isManagerRole && !isAdmin;
  const showFullAdminNav = isAdmin;
  const showElevatedAdminNav = showFullAdminNav || showManagerAdminNav;
  const name = session?.user?.name ?? session?.user?.email ?? "User";
  const email = session?.user?.email ?? "";

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
            ? "bg-black text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
        "flex flex-col border-r border-border bg-panel-elevated/70 backdrop-blur transition-[width] duration-200",
        collapsed ? "w-[4rem]" : "w-64"
      )}
    >
      <div className={cn("border-b border-border", collapsed ? "p-2" : "p-4")}>
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-auto px-3 py-2">
        {navItemsTop.map(({ href, label, icon }) => renderNavLink(href, label, icon))}
        <DepartmentsNavSection collapsed={collapsed} />
        {navItemsAfterDepartments.map(({ href, label, icon }) => renderNavLink(href, label, icon))}
        {showElevatedAdminNav && (
          <>
            {!collapsed && (
              <p className="mt-3 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {showManagerAdminNav ? "Management" : "Admin"}
              </p>
            )}
            <AdminTeamsNavSection
              collapsed={collapsed}
              allowedDepartment={showManagerAdminNav ? managerDepartment : null}
            />
            {(showFullAdminNav ? adminNavItemsAll : managerAdminNavItems)
              .filter((item) => showFullAdminNav || !ADMIN_ONLY_HREFS.has(item.href))
              .map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-black text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
    </aside>
  );
}
