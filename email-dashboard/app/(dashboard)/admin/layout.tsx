"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApi } from "@/lib/api/client";
import type { MeResponse } from "@/lib/types";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

    return "ok" as const;
  }, [status, session?.user?.email, me, meLoading, meError, adminEmailsList]);

  useEffect(() => {
    if (access === "unauthenticated") {
      router.replace("/signin");
      return;
    }
    if (access === "denied" || access === "no-session") {
      router.replace("/dashboard");
    }
  }, [access, router]);

  if (access === "session-loading" || access === "me-loading") {
    return (
      <div className="min-w-0 max-w-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[960px] space-y-4">
          <div className="h-8 w-40 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="h-40 max-w-full animate-pulse rounded-xl bg-muted/60" />
        </div>
      </div>
    );
  }

  if (access !== "ok") {
    return (
      <div className="min-w-0 max-w-full p-4 text-sm text-muted-foreground sm:p-6">Redirecting…</div>
    );
  }

  return children;
}
