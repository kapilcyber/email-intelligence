import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/signin" },
});

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/emails",
    "/emails/:path*",
    "/threads",
    "/threads/:path*",
    "/queue",
    "/queue/:path*",
    "/settings",
    "/settings/:path*",
    "/departments",
    "/departments/:path*",
    "/escalations",
    "/leads",
    "/retag",
    "/mom",
    "/mom/:path*",
    "/follow-up",
    "/follow-up/:path*",
    "/how-to-use",
    "/how-to-use/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
