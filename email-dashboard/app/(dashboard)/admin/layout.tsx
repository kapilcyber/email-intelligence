"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { getApi } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";

/** Admin-only areas; org Managers may not open these (sidebar hides them). */
const ADMIN_ONLY_PATH_PREFIXES = ["/admin/workflow", "/admin/approvals"];

function isAdminOnlyPathForManager(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  if (p === "/admin/team-projects") return true;
  if (ADMIN_ONLY_PATH_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  return false;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const adminEmailsList = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
    return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin");
      return;
    }
    if (status !== "authenticated" || !session?.user?.email) {
      setChecking(false);
      return;
    }
    const userEmail = (session.user.email ?? "").trim().toLowerCase();
    const isInEnvList = adminEmailsList.length > 0 && adminEmailsList.includes(userEmail);
    api
      .getMe()
      .then((me) => {
        const isAdminEffective = me.isAdmin || isInEnvList;
        const isManager = (me.role ?? "").trim() === "Manager";
        const isManagerOnly = isManager && !isAdminEffective;
        if (isManagerOnly && isAdminOnlyPathForManager(pathname)) {
          router.replace("/dashboard");
          setAllowed(false);
          return;
        }
        if (isAdminEffective || isManager) {
          setAllowed(true);
        } else {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        if (isInEnvList) setAllowed(true);
        else router.replace("/dashboard");
      })
      .finally(() => setChecking(false));
  }, [status, session?.user?.email, api, router, adminEmailsList, pathname]);

  if (checking) {
    return (
      <div className="flex items-center justify-center p-8">
        <Skeleton className="h-12 w-48 rounded-lg" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-neutral-500 dark:text-neutral-400">
        Redirecting…
      </div>
    );
  }
  return <>{children}</>;
}
