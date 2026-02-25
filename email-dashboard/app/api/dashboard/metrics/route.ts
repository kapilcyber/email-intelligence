import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    emailsIngestedToday: 0,
    queueSize: 0,
    activeWorkers: 0,
  });
}
