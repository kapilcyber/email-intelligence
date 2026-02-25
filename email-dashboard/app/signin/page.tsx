"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-2 text-center text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Email Intelligence
        </h1>
        <p className="mb-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Sign in with your Outlook account to access your dashboard.
        </p>
        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0078d4] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#106ebe] disabled:opacity-50"
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
