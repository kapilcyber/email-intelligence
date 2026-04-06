"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Webhook } from "lucide-react";

export default function WebhookPage() {
  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Webhook</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Phase 1 — Webhook status is not used. Email sync uses backfill (Sync inbox) only.
        </p>
      </div>
      <Card className="min-w-0 rounded-2xl border-border">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
            <Webhook className="h-6 w-6" aria-hidden />
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Graph webhook subscriptions are available in a later phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
