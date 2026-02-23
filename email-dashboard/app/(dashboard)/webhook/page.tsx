"use client";

export default function WebhookPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Webhook</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Phase 1 — Webhook status is not used. Email sync uses backfill (Sync inbox) only.
        </p>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 py-8 dark:border-neutral-800 dark:bg-neutral-900/30">
        <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
          Graph webhook subscriptions are available in a later phase.
        </p>
      </div>
    </div>
  );
}
