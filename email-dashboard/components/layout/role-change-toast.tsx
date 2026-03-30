"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { X, UserCog } from "lucide-react";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { dispatchMeUpdated } from "@/lib/me-sync-events";
import type { MeResponse } from "@/lib/types";

const SNAPSHOT_PREFIX = "ei_me_snapshot_v1:";
const PENDING_NOTICE_KEY = "ei_role_change_notice_v1";
const POLL_MS = 8_000;
const POST_LOGIN_TOAST_MS = 8_500;
const NOTICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Snapshot = { role: string; isAdmin: boolean };

type PendingRoleNotice = {
  email: string;
  fromRole: string;
  toRole: string;
  fromAdmin: boolean;
  toAdmin: boolean;
  savedAt: string;
};

function storageKey(email: string): string {
  return `${SNAPSHOT_PREFIX}${email.trim().toLowerCase()}`;
}

function readSnapshot(email: string): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(email));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Snapshot>;
    if (typeof o.role !== "string" || typeof o.isAdmin !== "boolean") return null;
    return { role: o.role, isAdmin: o.isAdmin };
  } catch {
    return null;
  }
}

function writeSnapshot(email: string, me: MeResponse, isInEnvList: boolean): void {
  sessionStorage.setItem(
    storageKey(email),
    JSON.stringify({
      role: (me.role ?? "Member").trim() || "Member",
      isAdmin: !!(me.isAdmin || isInEnvList),
    })
  );
}

function writePendingRoleNotice(n: Omit<PendingRoleNotice, "savedAt">): void {
  const payload: PendingRoleNotice = { ...n, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(PENDING_NOTICE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function readPendingRoleNotice(): PendingRoleNotice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_NOTICE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PendingRoleNotice>;
    if (
      typeof o.email !== "string" ||
      typeof o.fromRole !== "string" ||
      typeof o.toRole !== "string" ||
      typeof o.fromAdmin !== "boolean" ||
      typeof o.toAdmin !== "boolean" ||
      typeof o.savedAt !== "string"
    ) {
      return null;
    }
    const age = Date.now() - new Date(o.savedAt).getTime();
    if (!Number.isFinite(age) || age > NOTICE_MAX_AGE_MS || age < 0) return null;
    return o as PendingRoleNotice;
  } catch {
    return null;
  }
}

function clearPendingRoleNotice(): void {
  try {
    localStorage.removeItem(PENDING_NOTICE_KEY);
  } catch {
    /* ignore */
  }
}

function buildPostLoginToastMessage(n: PendingRoleNotice): string {
  const parts: string[] = [];
  if (n.fromRole !== n.toRole) {
    parts.push(`Role updated: ${n.fromRole} → ${n.toRole}`);
  }

  if (parts.length === 0) {
    return "Your account access was updated.";
  }
  return parts.join(". ") + ".";
}

const SIGNIN_ROLE_UPDATED = "/signin?reason=role-updated";

/**
 * Polls /api/me while authenticated; if org role or admin flag changes (e.g. admin updated the user),
 * stores a pending notice and logs out so NextAuth reloads. After sign-in again, shows a one-time
 * top-right toast with from → to details.
 */
export function RoleChangeSessionGuard() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const adminEmailsList = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
    return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forcedSignOutRef = useRef(false);
  const postLoginToastShownRef = useRef(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToastTimer = () => {
    if (toastDismissRef.current) {
      clearTimeout(toastDismissRef.current);
      toastDismissRef.current = null;
    }
  };

  const showPostLoginToast = useCallback((message: string) => {
    clearToastTimer();
    setToast(message);
    toastDismissRef.current = setTimeout(() => {
      setToast(null);
      toastDismissRef.current = null;
    }, POST_LOGIN_TOAST_MS);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) {
      postLoginToastShownRef.current = false;
      return;
    }
    const email = (session.user.email ?? "").trim().toLowerCase();
    if (!email || postLoginToastShownRef.current) return;

    const pending = readPendingRoleNotice();
    if (!pending || pending.email.trim().toLowerCase() !== email) {
      if (pending && pending.email.trim().toLowerCase() !== email) {
        clearPendingRoleNotice();
      }
      return;
    }

    postLoginToastShownRef.current = true;
    clearPendingRoleNotice();
    showPostLoginToast(buildPostLoginToastMessage(pending));
  }, [status, session?.user?.email, showPostLoginToast]);

  useEffect(() => {
    return () => clearToastTimer();
  }, []);

  const checkMe = useCallback(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    if (forcedSignOutRef.current) return;
    const email = (session.user.email ?? "").trim().toLowerCase();
    if (!email) return;
    const isInEnvList = adminEmailsList.length > 0 && adminEmailsList.includes(email);

    api
      .getMe()
      .then((me) => {
        if (forcedSignOutRef.current) return;
        const prev = readSnapshot(email);
        const roleNow = (me.role ?? "Member").trim() || "Member";
        const adminNow = !!(me.isAdmin || isInEnvList);

        if (prev && (prev.role !== roleNow || prev.isAdmin !== adminNow)) {
          forcedSignOutRef.current = true;
          writePendingRoleNotice({
            email,
            fromRole: prev.role,
            toRole: roleNow,
            fromAdmin: prev.isAdmin,
            toAdmin: adminNow,
          });
          try {
            sessionStorage.removeItem(storageKey(email));
          } catch {
            /* ignore */
          }
          dispatchMeUpdated();
          void api.recordLogout().catch(() => { });
          void signOut({ callbackUrl: SIGNIN_ROLE_UPDATED });
          return;
        }

        writeSnapshot(email, me, isInEnvList);
      })
      .catch(() => { });
  }, [status, session?.user?.email, api, adminEmailsList]);

  useEffect(() => {
    forcedSignOutRef.current = false;
  }, [session?.user?.email]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) {
      return;
    }

    checkMe();

    const onVisible = () => {
      if (document.visibilityState === "visible") checkMe();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkMe);

    pollRef.current = setInterval(checkMe, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkMe);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, session?.user?.email, checkMe]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed right-4 top-4 z-[100] flex max-w-md animate-in fade-in slide-in-from-top-2 duration-300",
        "rounded-xl border border-border bg-panel px-4 py-3 shadow-lg",
        "glass-surface-strong"
      )}
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10">
          <UserCog className="h-5 w-5 text-foreground" aria-hidden />
        </div>
        <p className="min-w-0 flex-1 pt-1 text-sm leading-snug text-foreground">{toast}</p>
        <button
          type="button"
          onClick={() => {
            clearToastTimer();
            setToast(null);
          }}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
