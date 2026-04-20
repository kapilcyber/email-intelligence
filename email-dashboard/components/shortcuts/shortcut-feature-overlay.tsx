"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LenisScrollArea } from "@/components/lenis/lenis-scroll-area";

export type ShortcutFeatureId = "mom" | "retag" | "follow-up";

const MomHistoryContent = dynamic(
  () => import("./mom-history-content").then((m) => m.MomHistoryContent),
  { loading: () => <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>, ssr: false }
);

const RetagContent = dynamic(
  () => import("./retag-content").then((m) => m.RetagContent),
  { loading: () => <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>, ssr: false }
);

const FollowUpContent = dynamic(
  () => import("./follow-up-content").then((m) => m.FollowUpContent),
  { loading: () => <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>, ssr: false }
);

const TITLES: Record<ShortcutFeatureId, string> = {
  mom: "MOM history",
  retag: "ReTag",
  "follow-up": "Follow UP",
};

export function ShortcutFeatureOverlay({
  portalMounted,
  feature,
  onClose,
}: {
  portalMounted: boolean;
  feature: ShortcutFeatureId | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!feature) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [feature]);

  useEffect(() => {
    if (!feature) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feature, onClose]);

  if (!portalMounted || !feature) return null;

  return createPortal(
    <div className="fixed inset-0 z-[560]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-neutral-950/45 backdrop-blur-sm dark:bg-black/50 dark:backdrop-blur-md"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-4 md:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcut-feature-title"
          className="pointer-events-auto flex max-h-[min(88vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl dark:border-border"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/80 px-4 py-3 sm:px-5 sm:py-4">
            <h2 id="shortcut-feature-title" className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {TITLES[feature]}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <LenisScrollArea className="max-h-[min(calc(100dvh-7.5rem),760px)] min-h-0 bg-panel">
            <div className="p-4 sm:p-5 md:p-6">
              {feature === "mom" && <MomHistoryContent />}
              {feature === "retag" && <RetagContent />}
              {feature === "follow-up" && <FollowUpContent embedded />}
            </div>
          </LenisScrollArea>
        </div>
      </div>
    </div>,
    document.body
  );
}
