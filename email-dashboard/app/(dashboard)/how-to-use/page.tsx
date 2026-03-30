"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Users, UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RoleTab = "user" | "manager" | "admin";

const TABS: Array<{ id: RoleTab; label: string; icon: typeof UserCircle }> = [
  { id: "user", label: "User guide", icon: UserCircle },
  { id: "manager", label: "Manager guide", icon: Users },
  { id: "admin", label: "Admin guide", icon: ShieldCheck },
];

type TourStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  role: RoleTab | "all";
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Start here every day. You can see summary cards, meetings, projects, and your role updates.",
    href: "/dashboard?tour=1",
    role: "all",
  },
  {
    id: "history",
    title: "History",
    description: "Open all synced emails with filters. Use this when you need detailed mail-level review.",
    href: "/emails",
    role: "all",
  },
  {
    id: "threads",
    title: "Threads",
    description: "Track complete conversations and reply flow by thread to avoid missing context.",
    href: "/threads",
    role: "all",
  },
  {
    id: "departments",
    title: "Departments toggle",
    description: "Expand Departments in the sidebar to inspect emails by team/category like Sales, Tech, Accounts, and more.",
    href: "/departments/all",
    role: "all",
  },
  {
    id: "escalations",
    title: "Escalations",
    description: "Check urgent messages that need action first.",
    href: "/escalations",
    role: "all",
  },
  {
    id: "leads",
    title: "Leads",
    description: "Review potential business leads and their priority labels.",
    href: "/leads",
    role: "all",
  },
  {
    id: "retag",
    title: "ReTag",
    description: "Move wrongly tagged escalation/lead mails into the correct department.",
    href: "/retag",
    role: "all",
  },
  {
    id: "mom",
    title: "MOM",
    description: "Manage meeting follow-up and pending MOM actions.",
    href: "/mom",
    role: "all",
  },
  {
    id: "followup",
    title: "Follow UP",
    description: "Track project follow-up email compliance by day and project.",
    href: "/follow-up",
    role: "all",
  },
  {
    id: "team-leaders",
    title: "Admin: Team leaders",
    description: "Manage users, role assignment, and login history.",
    href: "/admin/team-leaders",
    role: "admin",
  },
  {
    id: "projects",
    title: "Admin: Projects",
    description: "Create and manage team projects and assignees.",
    href: "/admin/team-projects",
    role: "admin",
  },
  {
    id: "tracker",
    title: "Admin: Tracker",
    description: "Set expected tracker days and monitor project-level tracker behavior.",
    href: "/admin/tracker",
    role: "admin",
  },
  {
    id: "review",
    title: "Admin: Review",
    description: "Audit team response performance and tracker quality metrics.",
    href: "/admin/review",
    role: "admin",
  },
];

export default function HowToUsePage() {
  const [active, setActive] = useState<RoleTab>("user");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);

  const visibleSteps = useMemo(
    () => TOUR_STEPS.filter((s) => s.role === "all" || s.role === active),
    [active]
  );

  useEffect(() => {
    // Auto-open once for first-time users so guide explains each feature by default.
    if (typeof window === "undefined") return;
    const key = "how_to_use_tour_seen_v1";
    const seen = window.localStorage.getItem(key);
    if (!seen) {
      setTourOpen(true);
      setTourIndex(0);
      window.localStorage.setItem(key, "1");
    }
  }, []);

  useEffect(() => {
    // When switching role tab, restart from first relevant step.
    setTourIndex(0);
  }, [active]);

  const currentStep = visibleSteps[tourIndex] ?? null;
  const isFirst = tourIndex === 0;
  const isLast = tourIndex >= visibleSteps.length - 1;

  const startTour = () => {
    setTourOpen(true);
    setTourIndex(0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">How to use</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={startTour}>
            Replay guided tour
          </Button>
          {tourOpen && (
            <Button type="button" variant="outline" onClick={() => setTourOpen(false)}>
              Hide tour panel
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role manuals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <Button
                  key={t.id}
                  type="button"
                  variant={active === t.id ? "default" : "outline"}
                  onClick={() => setActive(t.id)}
                  className={cn(
                    active === t.id && "bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {t.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {tourOpen && currentStep && (
        <Card className="border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/20">
          <CardHeader>
            <CardTitle className="text-base">
              Guided walkthrough ({tourIndex + 1}/{visibleSteps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">{currentStep.title}</p>
            <p className="text-neutral-700 dark:text-neutral-300">{currentStep.description}</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Open this toggle/page to see it in action.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={currentStep.href}>
                <Button type="button" size="sm">
                  Open {currentStep.title}
                </Button>
              </Link>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isFirst}
                onClick={() => setTourIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isLast ? "default" : "outline"}
                onClick={() => {
                  if (isLast) setTourIndex(0);
                  else setTourIndex((i) => Math.min(visibleSteps.length - 1, i + 1));
                }}
              >
                {isLast ? "Restart tour" : "Next feature"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {active === "manager" && (
        <Card>
          <CardHeader>
            <CardTitle>Manager manual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">1) Team oversight</p>
            <p>Review team inbox trends via Dashboard and department views.</p>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">2) Tracker compliance</p>
            <p>
              Ask team members to use Follow UP and keep subjects in the format with tracker + project name so sends are detected.
            </p>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">3) Escalation response</p>
            <p>Track pending escalations and ensure users are replying in time.</p>
          </CardContent>
        </Card>
      )}

      {active === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Admin manual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">1) Setup</p>
            <p>Create teams, users, reporting workflow, and projects in Admin pages.</p>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">2) Tracker configuration</p>
            <p>In Admin → Tracker, set expected weekdays per project and monitor project history.</p>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">3) Review module</p>
            <p>
              Use Admin → Review for user-wise escalation reply performance and project tracker count; add new review
              parameters in future as needed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
