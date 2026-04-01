"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApi } from "@/lib/api/client";
import type { MeResponse } from "@/lib/types";

const ADMIN_ONLY_PREFIXES_FOR_MANAGER = ["/admin/tracker", "/admin/review"];

function isAdminOnlyPathForManager(pathname: string): boolean {
  const p = pathname || "";
  return ADMIN_ONLY_PREFIXES_FOR_MANAGER.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { data: session, status } = useSession();
  const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  const adminEmailsList = useMemo(
    () => adminEmailsEnv.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    [adminEmailsEnv]
  );
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );

  const [me, setMe] = useState<MeResponse | null>(null);
  /** Start true so the first authenticated paint does not flash "denied" before the effect runs. */
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState(false);

  /** Fetch /api/me once per signed-in user (not on every admin sub-route). */
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setMe(null);
      setMeLoading(false);
      setMeError(false);
      return;
    }
    if (status !== "authenticated" || !session?.user?.email?.trim()) {
      setMe(null);
      setMeLoading(false);
      setMeError(false);
      return;
    }

    let cancelled = false;
    setMeLoading(true);
    setMeError(false);
    api
      .getMe()
      .then((r: MeResponse) => {
        if (!cancelled) {
          setMe(r);
          setMeError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMe(null);
          setMeError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setMeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.email, api]);

  const access = useMemo(() => {
    if (status === "loading") return "session-loading" as const;
    if (status === "unauthenticated") return "unauthenticated" as const;
    if (status !== "authenticated" || !session?.user?.email?.trim()) return "no-session" as const;
    if (meLoading) return "me-loading" as const;

    const userEmail = (session.user.email ?? "").trim().toLowerCase();
    const isInEnvList = adminEmailsList.length > 0 && adminEmailsList.includes(userEmail);

    if (meError && !isInEnvList) return "denied" as const;

    const isAdminEffective = (me?.isAdmin ?? false) || isInEnvList;
    const isManager = (me?.role ?? "").trim() === "Manager";
    if (!isAdminEffective && !isManager) return "denied" as const;

    const isManagerOnly = isManager && !isAdminEffective;
    if (isManagerOnly && isAdminOnlyPathForManager(pathname)) return "denied-manager-route" as const;

    return "ok" as const;
  }, [status, session?.user?.email, me, meLoading, meError, pathname, adminEmailsList]);

  useEffect(() => {
    if (access === "unauthenticated") {
      router.replace("/signin");
      return;
    }
    if (access === "denied" || access === "denied-manager-route" || access === "no-session") {
      router.replace("/dashboard");
    }
  }, [access, router]);

  if (access === "session-loading" || access === "me-loading") {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-[960px] space-y-4">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted/60" />
        </div>
      </div>
    );
  }

  if (access !== "ok") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  return children;
}
