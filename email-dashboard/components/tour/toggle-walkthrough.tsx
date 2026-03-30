"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo } from "react";

type ToggleGuide = {
  key: string;
  title: string;
  href: string;
  match: (pathname: string) => boolean;
  steps: Array<{ targetId: string; text: string }>;
};

const TOGGLE_GUIDES: ToggleGuide[] = [
  {
    key: "history",
    title: "History",
    href: "/emails",
    match: (p) => p === "/emails" || p.startsWith("/emails/"),
    steps: [
      { targetId: "emails-header", text: "This top block shows page context and current mailbox-focused scope." },
      { targetId: "emails-filters", text: "Use search/date filters and page-size controls to narrow the list." },
      { targetId: "emails-table", text: "This table contains email records. Open a row for full detail." },
      { targetId: "emails-pagination", text: "Use page controls to browse older messages." },
    ],
  },
  {
    key: "threads",
    title: "Threads",
    href: "/threads",
    match: (p) => p === "/threads" || p.startsWith("/threads/"),
    steps: [
      { targetId: "threads-sidebar", text: "Left panel lists thread controls and conversations." },
      { targetId: "threads-export", text: "Use the CSV export controls in this panel to download reply analytics." },
      { targetId: "threads-list", text: "Click a conversation row to open full back-and-forth." },
      { targetId: "threads-detail", text: "Right panel shows complete thread emails and response timing." },
    ],
  },
  {
    key: "departments",
    title: "Departments",
    href: "/departments/all",
    match: (p) => p === "/departments" || p.startsWith("/departments/"),
    steps: [
      { targetId: "emails-header", text: "This heading confirms the active department scope." },
      { targetId: "emails-filters", text: "Use filters to narrow department traffic quickly." },
      { targetId: "emails-table", text: "Review department-specific emails and open details." },
    ],
  },
  {
    key: "escalations",
    title: "Escalations",
    href: "/escalations",
    match: (p) => p === "/escalations" || p.startsWith("/escalations/"),
    steps: [
      { targetId: "escalations-filters", text: "Use date filter to focus on recent or older critical items." },
      { targetId: "escalations-list", text: "Open a row for detail; use Retag action to reroute mail." },
    ],
  },
  {
    key: "leads",
    title: "Leads",
    href: "/leads",
    match: (p) => p === "/leads" || p.startsWith("/leads/"),
    steps: [
      { targetId: "leads-filters", text: "Filter by lead label and date to prioritize pipeline review." },
      { targetId: "leads-list", text: "Open each lead to inspect summary, labels, and signals." },
    ],
  },
  {
    key: "retag",
    title: "ReTag",
    href: "/retag",
    match: (p) => p === "/retag" || p.startsWith("/retag/"),
    steps: [
      { targetId: "retag-header", text: "This page stores moved mails from Escalations/Leads." },
      { targetId: "retag-list", text: "Open entries to verify destination department and history." },
      { targetId: "retag-pagination", text: "Use pagination for older retag records." },
    ],
  },
  {
    key: "mom",
    title: "MOM",
    href: "/mom",
    match: (p) => p === "/mom" || p.startsWith("/mom/"),
    steps: [
      { targetId: "mom-filters", text: "Switch status filters: all, sent, or pending/snoozed." },
      { targetId: "mom-meetings", text: "This list shows meeting records and MOM status timeline." },
    ],
  },
  {
    key: "follow-up",
    title: "Follow UP",
    href: "/follow-up",
    match: (p) => p === "/follow-up" || p.startsWith("/follow-up/"),
    steps: [
      { targetId: "followup-header", text: "Page header explains tracker logic and current week." },
      { targetId: "followup-projects", text: "Project cards show expected days and your sent status." },
      { targetId: "followup-history", text: "Expand history inside a project to inspect actual sends." },
    ],
  },
];

export function ToggleWalkthrough() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const enabled = searchParams.get("walkthrough") === "1";
  const currentIndex = useMemo(() => TOGGLE_GUIDES.findIndex((g) => g.match(pathname)), [pathname]);
  const isRenderable = enabled && pathname !== "/dashboard" && currentIndex >= 0;
  const current = isRenderable ? TOGGLE_GUIDES[currentIndex] : null;
  const currentStepIdx = current
    ? Math.max(0, Math.min(Number(searchParams.get("wstep") ?? "0") || 0, current.steps.length - 1))
    : 0;
  const currentStep = current ? current.steps[currentStepIdx] : null;
  const activeSelector = currentStep ? `[data-tour-id="${currentStep.targetId}"]` : "";
  const prev = currentIndex > 0 ? TOGGLE_GUIDES[currentIndex - 1] : null;
  const next = currentIndex < TOGGLE_GUIDES.length - 1 ? TOGGLE_GUIDES[currentIndex + 1] : null;

  useEffect(() => {
    if (!isRenderable || !activeSelector) return;
    const el = document.querySelector(activeSelector);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isRenderable, activeSelector]);

  if (!isRenderable || !current || !currentStep) return null;

  const pageUrl = (href: string, step = 0) => `${href}?walkthrough=1&wstep=${step}`;
  const closeWalkthrough = () => router.replace(pathname);
  const prevStep = () =>
    router.push(pageUrl(current.href, Math.max(0, currentStepIdx - 1)));
  const nextStep = () =>
    router.push(pageUrl(current.href, Math.min(current.steps.length - 1, currentStepIdx + 1)));
  const isFirstStep = currentStepIdx === 0;
  const isLastStep = currentStepIdx >= current.steps.length - 1;

  return (
    <>
      <style>{`
        [data-tour-id] { transition: opacity 180ms ease, filter 180ms ease, box-shadow 180ms ease; }
        [data-tour-id]:not(${activeSelector}) { opacity: 0.42; filter: blur(1px); }
        ${activeSelector} { box-shadow: 0 0 0 2px rgba(99,102,241,0.75); border-radius: 12px; }
      `}</style>
      <div className="fixed bottom-4 right-4 z-50 w-[min(560px,calc(100vw-2rem))] rounded-xl border border-neutral-700 bg-black/95 p-4 text-white shadow-2xl backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
        Toggle walkthrough ({currentIndex + 1}/{TOGGLE_GUIDES.length}) · Feature {currentStepIdx + 1}/{current.steps.length}
      </p>
      <p className="mt-1 text-sm font-semibold">{current.title}</p>
      <p className="mt-2 text-xs text-neutral-200">{currentStep.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-neutral-600 bg-black text-white hover:bg-neutral-900"
          disabled={isFirstStep}
          onClick={prevStep}
        >
          Previous feature
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-neutral-600 bg-black text-white hover:bg-neutral-900"
          disabled={isLastStep}
          onClick={nextStep}
        >
          Next feature
        </Button>
        {isLastStep && prev ? (
          <Link href={pageUrl(prev.href)}>
            <Button type="button" size="sm" variant="outline" className="border-neutral-600 bg-black text-white hover:bg-neutral-900">
              Previous toggle
            </Button>
          </Link>
        ) : null}
        {isLastStep && next ? (
          <Link href={pageUrl(next.href)}>
            <Button type="button" size="sm" variant="outline" className="border-neutral-600 bg-black text-white hover:bg-neutral-900">
              Open next toggle
            </Button>
          </Link>
        ) : null}
        {isLastStep && !next ? (
          <Link href="/how-to-use">
            <Button type="button" size="sm" className="bg-white text-black hover:bg-neutral-200">
              How to use
            </Button>
          </Link>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-neutral-200 hover:bg-neutral-900 hover:text-white"
          onClick={closeWalkthrough}
        >
          Close walkthrough
        </Button>
      </div>
      </div>
    </>
  );
}

