import type { CalendarEventOut } from "@/lib/types";

export type MomStatus = "snoozed" | "sent" | "skipped";

export interface MomRecord {
  eventKey: string;
  subject: string;
  startISO: string;
  endISO: string;
  meetingType: string;
  status: MomStatus;
  /** When status is snoozed, prompt again after this (epoch ms). */
  snoozeUntil: number | null;
  sentAt: string | null;
  updatedAt: string;
}

export function momEventKey(ev: CalendarEventOut): string {
  const id = ev.id?.trim();
  if (id) return id;
  const st = ev.start?.dateTime ?? "";
  return `fb:${(ev.subject || "(no subject)").slice(0, 120)}:${st}`;
}

export function inferMeetingType(ev: CalendarEventOut): string {
  if (ev.isOnlineMeeting || (ev.joinUrl && ev.joinUrl.trim())) return "Online";
  if (ev.location && ev.location.trim()) return "In person";
  return "Unknown";
}

export function momRecordsToMap(records: MomRecord[]): Map<string, MomRecord> {
  return new Map(records.map((r) => [r.eventKey, r]));
}

/** Sort by meeting end time descending (newest first). */
export function sortMomRecordsByEndDesc(records: MomRecord[]): MomRecord[] {
  return [...records].sort((a, b) => (a.endISO < b.endISO ? 1 : a.endISO > b.endISO ? -1 : 0));
}

export function buildMomRecordSent(ev: CalendarEventOut): MomRecord {
  const now = new Date().toISOString();
  const key = momEventKey(ev);
  return {
    eventKey: key,
    subject: ev.subject || "(No subject)",
    startISO: ev.start?.dateTime ?? "",
    endISO: ev.end?.dateTime ?? "",
    meetingType: inferMeetingType(ev),
    status: "sent",
    snoozeUntil: null,
    sentAt: now,
    updatedAt: now,
  };
}

export function buildMomRecordSnoozed(ev: CalendarEventOut, delayMs: number): MomRecord {
  const now = new Date().toISOString();
  const until = Date.now() + delayMs;
  const key = momEventKey(ev);
  return {
    eventKey: key,
    subject: ev.subject || "(No subject)",
    startISO: ev.start?.dateTime ?? "",
    endISO: ev.end?.dateTime ?? "",
    meetingType: inferMeetingType(ev),
    status: "snoozed",
    snoozeUntil: until,
    sentAt: null,
    updatedAt: now,
  };
}

export function buildMomRecordSkipped(ev: CalendarEventOut): MomRecord {
  const now = new Date().toISOString();
  const key = momEventKey(ev);
  return {
    eventKey: key,
    subject: ev.subject || "(No subject)",
    startISO: ev.start?.dateTime ?? "",
    endISO: ev.end?.dateTime ?? "",
    meetingType: inferMeetingType(ev),
    status: "skipped",
    snoozeUntil: null,
    sentAt: null,
    updatedAt: now,
  };
}
