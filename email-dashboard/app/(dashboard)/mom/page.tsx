"use client";

import { MomHistoryContent } from "@/components/shortcuts/mom-history-content";

export default function MomHistoryPage() {
  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          MOM history
        </h1>
      </div>
      <MomHistoryContent />
    </div>
  );
}
