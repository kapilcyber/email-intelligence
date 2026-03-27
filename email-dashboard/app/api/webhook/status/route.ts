import { NextResponse } from "next/server";

const BACKEND_BASE = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "";

export async function GET() {
  if (!BACKEND_BASE) {
    return NextResponse.json(
      {
        subscription: null,
        status: "error",
        errorLogs: ["Backend URL is not configured. Set BACKEND_API_URL or NEXT_PUBLIC_API_URL."],
      },
      { status: 503 }
    );
  }
  try {
    const res = await fetch(`${BACKEND_BASE}/api/webhook/status`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await res.json().catch(() => ({
      subscription: null,
      status: "error",
      errorLogs: ["Invalid JSON returned by backend /api/webhook/status"],
    }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown proxy error";
    return NextResponse.json(
      { subscription: null, status: "error", errorLogs: [`Webhook status proxy failed: ${message}`] },
      { status: 502 }
    );
  }
}
