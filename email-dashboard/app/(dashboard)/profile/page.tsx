"use client";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Profile</h1>
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign-in and profile are disabled. Use Settings for app configuration.
        </p>
      </div>
    </div>
  );
}
