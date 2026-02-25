"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Moon, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { SystemStatus, HealthResponse } from "@/lib/types";

const statusConfig: Record<SystemStatus, { label: string; dotClass: string }> = {
  healthy: { label: "Operational", dotClass: "bg-emerald-500" },
  degraded: { label: "Degraded", dotClass: "bg-amber-500" },
  error: { label: "Error", dotClass: "bg-red-500" },
};

function statusDetail(services: HealthResponse["services"] | null): string {
  if (!services) return "";
  const parts: string[] = [];
  if (services.database !== "healthy") parts.push(`DB: ${services.database}`);
  if (services.redis !== "healthy") parts.push(`Redis: ${services.redis}`);
  if (services.graph !== "healthy") parts.push(`Graph: ${services.graph}`);
  return parts.length ? parts.join(", ") : "";
}

export function Topbar({
  systemStatus: initialStatus,
  environment = "Dev",
}: {
  systemStatus?: SystemStatus;
  environment?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [status, setStatus] = useState<SystemStatus>(initialStatus ?? "healthy");
  const [healthDetail, setHealthDetail] = useState<HealthResponse["services"] | null>(null);

  useEffect(() => {
    const fetchHealth = () => {
      api
        .getHealth()
        .then((r) => {
          setStatus(r.status);
          setHealthDetail(r.services);
        })
        .catch(() => {
          setStatus("error");
          setHealthDetail(null);
        });
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 20000);
    return () => clearInterval(interval);
  }, []);
  const { label, dotClass } = statusConfig[status];
  const detail = statusDetail(healthDetail);
  const statusText = detail ? `${label} (${detail})` : label;
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return (
    <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} aria-hidden />
          <span className="text-sm text-neutral-600 dark:text-neutral-400 truncate" title={statusText}>
            {statusText}
          </span>
        </div>
        <Badge variant="secondary" className="font-normal shrink-0">
          {environment}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/signin" })}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
        >
          <Sun className="h-5 w-5 dark:hidden" />
          <Moon className="hidden h-5 w-5 dark:block" />
        </Button>
      </div>
    </header>
  );
}
