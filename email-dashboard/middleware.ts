import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

export default withAuth({
  pages: { signIn: "/signin" },
});

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/emails", "/emails/:path*", "/queue", "/queue/:path*", "/settings", "/settings/:path*", "/departments", "/departments/:path*"],
};
