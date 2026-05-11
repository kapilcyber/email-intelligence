"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Settings</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Phase 1 - Email ingestion. No settings to configure.
        </p>
      </div>
      <Card className="min-w-0 rounded-2xl border-border">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
            <Settings className="h-6 w-6" aria-hidden />
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Configuration and credentials are not exposed in Phase 1.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
