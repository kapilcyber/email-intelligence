import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

/**
 * Minimal login: `openid profile email` only (no Calendars.Read / User.Read on the consent screen).
 *
 * Overrides default Azure AD `profile` so we do NOT call Graph `/me/photos` during sign-in (that call
 * expects broader Graph rights and can break or push admin-consent flows). OIDC claims only for now.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_TENANT_ID,
      authorization: {
        params: {
          scope: "openid profile email",
          prompt: "select_account",
        },
      },
      profile(profile) {
        const p = profile as {
          sub?: string;
          name?: string | null;
          email?: string | null;
          preferred_username?: string | null;
        };
        const email = (p.email || p.preferred_username || "").trim() || null;
        return {
          id: p.sub ?? email ?? "unknown",
          name: p.name ?? email?.split("@")[0] ?? null,
          email,
          image: null,
        };
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  trustHost: true,
};
