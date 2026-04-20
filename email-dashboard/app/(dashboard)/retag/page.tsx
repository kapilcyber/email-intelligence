"use client";

import { RetagContent } from "@/components/shortcuts/retag-content";

export default function RetagPage() {
  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div data-tour-id="retag-header" className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">ReTag</h1>
      </div>
      <RetagContent />
    </div>
  );
}
