import { NextResponse } from "next/server";

/** Phase 1: webhook status not used. Stub for any legacy calls. */
export async function GET() {
  return NextResponse.json({
    subscription: null,
    status: "not_used",
    errorLogs: [],
  });
}
