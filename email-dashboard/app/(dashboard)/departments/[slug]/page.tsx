"use client";

import { useMemo } from "react";
import { useParams, notFound } from "next/navigation";
import { EmailsView } from "@/components/emails/emails-view";
import { DepartmentSubnav } from "@/components/departments/department-subnav";
import { slugToCategoryFilter } from "@/lib/departments";

export default function DepartmentSlugPage() {
  const params = useParams();
  const slug =
    typeof params.slug === "string" ? params.slug : Array.isArray(params.slug) ? params.slug[0] : "";

  const categoryFilter = useMemo(() => {
    if (!slug) return undefined;
    return slugToCategoryFilter(slug);
  }, [slug]);

  if (categoryFilter === undefined) {
    notFound();
  }

  return (
    <div className="min-w-0 max-w-full">
      <DepartmentSubnav />
      <EmailsView categoryFilter={categoryFilter} title="Departments" />
    </div>
  );
}
