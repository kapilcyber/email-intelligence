"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Profile</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Account information for this workspace.
        </p>
      </div>
      <Card className="min-w-0 rounded-2xl border-border">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug">
            <UserCircle className="h-5 w-5 shrink-0 text-accent" />
            <span className="min-w-0 break-words">Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sign-in and profile are disabled. Use Settings for app configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
