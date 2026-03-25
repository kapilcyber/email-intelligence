"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getApi } from "@/lib/api/client";
import type { CalendarEventOut } from "@/lib/types";
import { meetingsNeedingMomPrompt } from "@/lib/mom-eligibility";
import type { MomRecord } from "@/lib/mom-storage";
import {
  buildMomRecordSent,
  buildMomRecordSkipped,
  buildMomRecordSnoozed,
  momRecordsToMap,
} from "@/lib/mom-storage";
import { MomPromptDialog } from "@/components/meetings/mom-prompt-dialog";

const SNOOZE_MS = 10 * 60 * 1000;
const POLL_MS = 30_000;

export function MomPromptHost() {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const api = useMemo(() => getApi(email, session?.user?.name ?? null), [email, session?.user?.name]);

  const [events, setEvents] = useState<CalendarEventOut[]>([]);
  const [momRecords, setMomRecords] = useState<Map<string, MomRecord>>(() => new Map());

  const loadMomRecordsFromApi = useCallback(() => {
    if (status !== "authenticated" || !email) return;
    api
      .getMomRecords()
      .then((r) => setMomRecords(momRecordsToMap(r.records ?? [])))
      .catch(() => setMomRecords(new Map()));
  }, [api, status, email]);

  const loadCalendar = useCallback(() => {
    if (status !== "authenticated" || !email) return;
    api
      .getDashboardCalendarEvents(21, null, "mail")
      .then((r) => setEvents(r.events ?? []))
      .catch(() => setEvents([]));
  }, [api, status, email]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const t = window.setInterval(loadCalendar, 120_000);
    return () => clearInterval(t);
  }, [status, loadCalendar]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), POLL_MS);
    const onMom = () => setNowMs(Date.now());
    window.addEventListener("mom-records-changed", onMom);
    return () => {
      clearInterval(t);
      window.removeEventListener("mom-records-changed", onMom);
    };
  }, []);

  const queue = useMemo(
    () => (email ? meetingsNeedingMomPrompt(events, new Date(nowMs), momRecords) : []),
    [events, email, nowMs, momRecords]
  );

  const current = queue[0] ?? null;
  const open = current != null;

  const persistMom = useCallback(
    (record: MomRecord) => {
      if (!email) return;
      api
        .upsertMomRecord(record)
        .then(() => {
          loadMomRecordsFromApi();
          window.dispatchEvent(new CustomEvent("mom-records-changed"));
        })
        .catch(() => {});
    },
    [api, email, loadMomRecordsFromApi]
  );

  const onMarkSent = useCallback(() => {
    if (!email || !current) return;
    persistMom(buildMomRecordSent(current));
  }, [email, current, persistMom]);

  const onRemindTenMinutes = useCallback(() => {
    if (!email || !current) return;
    persistMom(buildMomRecordSnoozed(current, SNOOZE_MS));
  }, [email, current, persistMom]);

  const onNotApplicable = useCallback(() => {
    if (!email || !current) return;
    persistMom(buildMomRecordSkipped(current));
  }, [email, current, persistMom]);

  if (status !== "authenticated" || !email) return null;

  return (
    <MomPromptDialog
      open={open}
      event={current}
      onMarkSent={onMarkSent}
      onRemindTenMinutes={onRemindTenMinutes}
      onNotApplicable={onNotApplicable}
    />
  );
}
