"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { FolderOpen, Mail, ChevronRight } from "lucide-react";

const DEPARTMENT_OPTIONS = ["Sales", "HR", "Accounts", "Tech", "General", "Spam"] as const;

export default function DepartmentsPage() {
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalEmails, setTotalEmails] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getDashboardMetrics()
      .then((m) => {
        setCategoryCounts(m.categoryCounts ?? {});
        setTotalEmails(m.totalEmails ?? 0);
      })
      .catch(() => setError("Failed to load departments"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Departments</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            All departments with email counts. Open one to see its emails.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/30 p-8">
          <div className="h-64 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Departments</h1>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Departments</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          All departments with email counts. Open one to see its segregated emails.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/50 overflow-hidden">
        <div className="border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/50">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            <FolderOpen className="h-4 w-4" />
            All departments
          </h2>
        </div>
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          <li>
            <Link
              href="/emails"
              className="flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <span className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-neutral-400" />
                <span className="font-medium text-neutral-900 dark:text-neutral-50">All</span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  All emails (no filter)
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                  {totalEmails}
                </span>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </span>
            </Link>
          </li>
          {DEPARTMENT_OPTIONS.map((dept) => {
            const count = categoryCounts[dept] ?? 0;
            return (
              <li key={dept}>
                <Link
                  href={`/emails?category=${encodeURIComponent(dept)}`}
                  className="flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <span className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 shrink-0 text-neutral-400" />
                    <span className="font-medium text-neutral-900 dark:text-neutral-50">
                      {dept}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                      {count}
                    </span>
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Click a department to open the Emails view filtered to that department.
      </p>
    </div>
  );
}
