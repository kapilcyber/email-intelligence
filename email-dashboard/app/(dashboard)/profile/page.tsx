"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Profile</h1>
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign-in and profile are disabled. Use Settings for app configuration.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
