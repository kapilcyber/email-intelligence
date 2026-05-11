"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DEPARTMENT_CATEGORIES,
  DEPARTMENT_SLUG_TO_CATEGORY,
  normalizeCategoryQueryParam,
} from "@/lib/departments";

const LINKS: { slug: string; label: string }[] = [
  { slug: "all", label: "All" },
  ...DEPARTMENT_CATEGORIES.map((c) => ({ slug: c.toLowerCase(), label: c })),
];

function buildHistoryHref(slug: string, searchParams: URLSearchParams): string {
  const p = new URLSearchParams(searchParams.toString());
  const cat = DEPARTMENT_SLUG_TO_CATEGORY[slug as keyof typeof DEPARTMENT_SLUG_TO_CATEGORY];
  if (slug === "all" || cat === undefined || cat === "") {
    p.delete("category");
  } else {
    p.set("category", cat);
  }
  const q = p.toString();
  return q ? `/emails?${q}` : "/emails";
}

function DepartmentSubnavInner({
  getHref,
  isActive,
}: {
  getHref: (slug: string) => string;
  isActive: (slug: string) => boolean;
}) {
  return (
    <nav
      className="-mx-0.5 mb-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1 pt-0.5 [-webkit-overflow-scrolling:touch] sm:mb-5 sm:flex-wrap sm:overflow-visible sm:pb-0"
      aria-label="Department filters"
    >
      {LINKS.map(({ slug, label }) => (
        <Link
          key={slug}
          href={getHref(slug)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            isActive(slug)
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-border/90 bg-panel/90 text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Horizontal department links for /departments/* - especially useful on mobile
 * where the sidebar drawer is one tap away.
 */
export function DepartmentSubnav() {
  const pathname = usePathname();
  const norm = (pathname || "").replace(/\/$/, "") || "/";

  return (
    <DepartmentSubnavInner
      getHref={(slug) => `/departments/${slug}`}
      isActive={(slug) => {
        const href = `/departments/${slug}`;
        return norm === href || norm.endsWith(`/${slug}`);
      }}
    />
  );
}

/**
 * Same pills as {@link DepartmentSubnav}, but filters History (/emails) via ?category=
 * and preserves other query params (e.g. search). Use inside a Suspense boundary.
 */
export function HistoryDepartmentSubnav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const norm = (pathname || "").replace(/\/$/, "") || "/";
  const effectiveCategory = normalizeCategoryQueryParam(searchParams.get("category"));
  const onEmails = norm === "/emails";

  return (
    <DepartmentSubnavInner
      getHref={(slug) => buildHistoryHref(slug, searchParams)}
      isActive={(slug) => {
        if (!onEmails) return false;
        if (slug === "all") return !effectiveCategory;
        const cat = DEPARTMENT_SLUG_TO_CATEGORY[slug as keyof typeof DEPARTMENT_SLUG_TO_CATEGORY];
        return !!cat && effectiveCategory === cat;
      }}
    />
  );
}
