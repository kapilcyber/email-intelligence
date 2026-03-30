"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { FollowUpReminderItem } from "@/lib/types";
import { FollowUpReminderDialog } from "@/components/follow-up/follow-up-reminder-dialog";

const POLL_MS = 4 * 60 * 1000;

function storageDismissKey(projectId: string): string {
  const d = new Date().toISOString().slice(0, 10);
  return `fu-tracker-dismiss-${d}-${projectId}`;
}

function filterNotDismissed(list: FollowUpReminderItem[]): FollowUpReminderItem[] {
  if (typeof window === "undefined") return list;
  return list.filter((r) => sessionStorage.getItem(storageDismissKey(r.projectId)) !== "1");
}

export function FollowUpReminderHost() {
  const { data: session, status } = useSession();
  const api = useMemo(
    () => getApi(session?.user?.email ?? null, session?.user?.name ?? null),
    [session?.user?.email, session?.user?.name]
  );
  const [items, setItems] = useState<FollowUpReminderItem[]>([]);
  const [open, setOpen] = useState(false);

  const fetchReminders = useCallback(() => {
    if (status !== "authenticated") return;
    api
      .getFollowUpReminders()
      .then((r) => {
        const filtered = filterNotDismissed(r.reminders ?? []);
        setItems(filtered);
        setOpen(filtered.length > 0);
      })
      .catch(() => {
        setItems([]);
        setOpen(false);
      });
  }, [api, status]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const t = window.setInterval(fetchReminders, POLL_MS);
    return () => clearInterval(t);
  }, [status, fetchReminders]);

  const handleDismiss = () => {
    for (const r of items) {
      try {
        sessionStorage.setItem(storageDismissKey(r.projectId), "1");
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    setItems([]);
  };

  if (status !== "authenticated") return null;

  return <FollowUpReminderDialog open={open} items={items} onDismiss={handleDismiss} />;
}
