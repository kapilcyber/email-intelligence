import type { CalendarEventOut } from "@/lib/types";
import type { MomRecord } from "@/lib/mom-storage";
import { momEventKey } from "@/lib/mom-storage";

function parseGraphDateTime(iso: string | undefined | null): Date | null {
  if (!iso?.trim()) return null;
  let s = iso.trim();
  if (!s.endsWith("Z") && !s.includes("+") && !/T\d{2}:\d{2}.*-\d{2}:?\d{2}$/.test(s)) {
    s = `${s}Z`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Meetings that have ended recently and still need a MOM decision (not sent / not skipped / snooze expired).
 */
export function meetingsNeedingMomPrompt(
  events: CalendarEventOut[],
  now: Date,
  records: Map<string, MomRecord>
): CalendarEventOut[] {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const eligible = events.filter((ev) => {
    if (ev.isCancelled) return false;
    const end = parseGraphDateTime(ev.end?.dateTime);
    if (!end || end.getTime() > now.getTime()) return false;
    if (end.getTime() < weekAgo) return false;
    const key = momEventKey(ev);
    const rec = records.get(key);
    if (!rec) return true;
    if (rec.status === "sent" || rec.status === "skipped") return false;
    if (rec.status === "snoozed" && rec.snoozeUntil != null && now.getTime() < rec.snoozeUntil) return false;
    return true;
  });

  return eligible.sort((a, b) => {
    const eb = parseGraphDateTime(b.end?.dateTime)?.getTime() ?? 0;
    const ea = parseGraphDateTime(a.end?.dateTime)?.getTime() ?? 0;
    return eb - ea;
  });
}

export function formatMomTimeRange(ev: CalendarEventOut): string {
  const start = parseGraphDateTime(ev.start?.dateTime);
  const end = parseGraphDateTime(ev.end?.dateTime);
  if (!start && !end) return "—";
  const datePart =
    start?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) ??
    end?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) ??
    "";
  if (start && end) {
    const t0 = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const t1 = end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${datePart} · ${t0} – ${t1}`;
  }
  if (start) return `${datePart} · ${start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  return `${datePart} · ${end!.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
