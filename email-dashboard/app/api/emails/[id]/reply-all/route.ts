import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Proxies delegated Graph reply-all to FastAPI using the user's Microsoft access token
 * from the NextAuth JWT (never exposed to browser JS).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json({ error: "NEXTAUTH_SECRET is not configured" }, { status: 500 });
  }

  const token = await getToken({ req: request as never, secret });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = token.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json(
      {
        error:
          "No Microsoft access token. Sign out and sign in again after delegated Mail.Send is granted in Azure.",
      },
      { status: 401 }
    );
  }
  if (token.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Session expired. Please sign out and sign in again." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing email id" }, { status: 400 });
  }

  let body: { comment?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" ? body.comment : "";
  if (!comment.trim()) {
    return NextResponse.json({ error: "comment is required" }, { status: 400 });
  }

  const base = (process.env.BACKEND_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "API URL is not configured" }, { status: 500 });
  }

  const res = await fetch(`${base}/api/emails/${encodeURIComponent(id)}/reply-all`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": String(token.email).trim(),
      "X-Microsoft-Graph-Access-Token": accessToken,
    },
    body: JSON.stringify({
      comment,
      contentType: body.contentType ?? "Text",
    }),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    data = { detail: text || res.statusText };
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : text || `Error ${res.status}`;
    return NextResponse.json({ error: msg }, { status: res.status >= 500 ? 502 : res.status });
  }

  return NextResponse.json(typeof data === "object" && data !== null ? data : { ok: true });
}
