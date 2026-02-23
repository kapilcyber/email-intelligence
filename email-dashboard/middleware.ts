import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth disabled for now — all routes are public. To re-enable sign-in, use:
// import { withAuth } from "next-auth/middleware";
// export default withAuth({ pages: { signIn: "/signin" } });
// export const config = { matcher: ["/dashboard", "/dashboard/:path*", "/emails", "/emails/:path*", "/profile", "/queue", "/settings"] };

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}
