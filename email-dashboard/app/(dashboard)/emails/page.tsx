"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EmailsView } from "@/components/emails/emails-view";
import { HistoryDepartmentSubnav } from "@/components/departments/department-subnav";
import { normalizeCategoryQueryParam } from "@/lib/departments";

function EmailsFromQuery() {
  const searchParams = useSearchParams();
  const category = useMemo(
    () => normalizeCategoryQueryParam(searchParams.get("category")),
    [searchParams]
  );
  const search = useMemo(() => (searchParams.get("search") ?? "").trim(), [searchParams]);

  return (
    <div className="min-w-0 max-w-full">
      <HistoryDepartmentSubnav />
      <EmailsView categoryFilter={category} initialSearch={search} showRetag title="Mailbox" />
    </div>
  );
}

export default function EmailsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
      <EmailsFromQuery />
    </Suspense>
  );
}
