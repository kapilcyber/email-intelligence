"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const roleUpdated = searchParams.get("reason") === "role-updated";

  useEffect(() => {
    router.prefetch(callbackUrl);
  }, [router, callbackUrl]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("azure-ad", { callbackUrl, redirect: false });
      if (result?.error) {
        setError(result.error === "AccessDenied" ? "Access was denied." : "Sign-in failed. Please try again.");
        setLoading(false);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      router.push(callbackUrl);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-app-gradient py-8 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(2rem,env(safe-area-inset-top,0px))]">
      <div className="w-full min-w-0 max-w-sm rounded-2xl border border-border bg-panel p-6 shadow-sm sm:p-8">
        <h1 className="mb-2 text-center text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Email Intelligence
        </h1>
        <p className="mb-6 text-center text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Sign in with your Outlook account to access your dashboard.
        </p>
        {roleUpdated && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            Your role or access was updated by an administrator. Sign in again to refresh your session.
          </p>
        )}
        {error && (
          <p className="mb-4 break-words rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? (
            "Signing in…"
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 21 21" fill="currentColor" aria-hidden>
                <path d="M0 0h10v10H0V0zm11 0h10v10H11V0zM0 11h10v10H0V11zm11 0h10v10H11V11z" />
              </svg>
              Sign in with Microsoft
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center px-4 py-8 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <SignInPageContent />
    </Suspense>
  );
}
