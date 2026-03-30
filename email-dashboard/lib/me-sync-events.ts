/** Broadcast when `/api/me` data may have changed (e.g. role updated by admin). */
export const ME_UPDATED_EVENT = "email-intelligence:me-updated";

export function dispatchMeUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ME_UPDATED_EVENT));
}
