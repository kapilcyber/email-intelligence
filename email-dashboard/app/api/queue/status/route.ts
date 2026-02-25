import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    pending: 0,
    active: 0,
    failed: 0,
    retryCount: 0,
    workerUptime: 0,
    taskDistribution: [],
  });
}
