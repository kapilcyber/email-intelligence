"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DEPARTMENT_CATEGORIES } from "@/lib/departments";

const LINKS: { slug: string; label: string }[] = [
  { slug: "all", label: "All" },
  ...DEPARTMENT_CATEGORIES.map((c) => ({ slug: c.toLowerCase(), label: c })),
];

/**
 * Horizontal department links for /departments/* — especially useful on mobile
 * where the sidebar drawer is one tap away.
 */
export function DepartmentSubnav() {
  const pathname = usePathname();
  const norm = (pathname || "").replace(/\/$/, "") || "/";

  return (
    <nav
      className="-mx-0.5 mb-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1 pt-0.5 [-webkit-overflow-scrolling:touch] sm:mb-5 sm:flex-wrap sm:overflow-visible sm:pb-0"
      aria-label="Department filters"
    >
      {LINKS.map(({ slug, label }) => {
        const href = `/departments/${slug}`;
        const active = norm === href || norm.endsWith(`/${slug}`);
        return (
          <Link
            key={slug}
            href={href}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-border/90 bg-panel/90 text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
