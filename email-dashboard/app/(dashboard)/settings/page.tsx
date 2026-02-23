"use client";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Phase 1 — Email ingestion. No settings to configure.
        </p>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 py-8 dark:border-neutral-800 dark:bg-neutral-900/30">
        <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
          Configuration and credentials are not exposed in Phase 1.
        </p>
      </div>
    </div>
  );
}
