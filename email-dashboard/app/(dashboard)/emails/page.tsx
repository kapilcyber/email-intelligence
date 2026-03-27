"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EmailsView } from "@/components/emails/emails-view";
import { normalizeCategoryQueryParam } from "@/lib/departments";

function EmailsFromQuery() {
  const searchParams = useSearchParams();
  const category = useMemo(
    () => normalizeCategoryQueryParam(searchParams.get("category")),
    [searchParams]
  );

  return <EmailsView categoryFilter={category} showRetag />;
}

export default function EmailsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
      <EmailsFromQuery />
    </Suspense>
  );
}
