"use client";

import { useState } from "react";
import { BookOpen, ShieldCheck, Users, UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RoleTab = "user" | "manager" | "admin";

const TABS: Array<{ id: RoleTab; label: string; icon: typeof UserCircle }> = [
  { id: "user", label: "User guide", icon: UserCircle },
  { id: "manager", label: "Manager guide", icon: Users },
  { id: "admin", label: "Admin guide", icon: ShieldCheck },
];

export default function HowToUsePage() {
  const [active, setActive] = useState<RoleTab>("user");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          <BookOpen className="h-7 w-7 shrink-0 opacity-80" />
          How to use
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          Platform usage manual by role. Choose User, Manager, or Admin instructions.
        </p>
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

      {active === "user" && (
        <Card>
          <CardHeader>
            <CardTitle>User manual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">1) Daily monitoring</p>
            <p>Use Dashboard for summary, then open History/Threads for details and replies.</p>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">2) Follow UP (tracker)</p>
            <p>
              Open <span className="font-medium">Follow UP</span> to check whether you sent project tracker mails for expected days.
              Expand project history to verify past sends.
            </p>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">3) MOM and actions</p>
            <p>Respond to MOM prompt after meetings and use Escalations/Leads/ReTag views as needed.</p>
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
