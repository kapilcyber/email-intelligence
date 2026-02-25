import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    tenantId: "",
    graphClientId: "",
    redisHost: "",
    databaseHost: "",
    environment: "development",
  });
}
