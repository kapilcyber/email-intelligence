import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;
  if (!userEmail?.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: emailId, attachmentId } = await params;
  const download = request.nextUrl.searchParams.get("download") === "1";
  const path = `/api/emails/${emailId}/attachments/${attachmentId}${download ? "?download=1" : ""}`;
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { "X-User-Email": userEmail.trim() },
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        return NextResponse.json(body, { status: res.status });
      } catch {
        return new NextResponse(text, { status: res.status });
      }
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = res.headers.get("content-disposition");
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
    headers.set("Cache-Control", "private, max-age=300");
    return new NextResponse(res.body, { status: 200, headers });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch attachment" },
      { status: 502 }
    );
  }
}
