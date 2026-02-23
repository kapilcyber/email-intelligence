import { mockData } from "@/lib/api/mock";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(mockData.queueStatus());
}
