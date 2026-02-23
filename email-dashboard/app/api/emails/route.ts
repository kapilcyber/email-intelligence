import { mockData } from "@/lib/api/mock";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
  const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;
  const search = searchParams.get("search") ?? undefined;
  const data = mockData.emails({ page, pageSize, search });
  return NextResponse.json(data);
}
