"use client";

import { useMemo } from "react";
import { useParams, notFound } from "next/navigation";
import { EmailsView } from "@/components/emails/emails-view";
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
    <EmailsView
      categoryFilter={categoryFilter}
      title="Departments"
      description={
        categoryFilter ? (
          <>
            Mailbox emails classified as <strong>{categoryFilter}</strong>.
          </>
        ) : (
          <>All ingested emails for your mailbox (no department filter).</>
        )
      }
    />
  );
}
