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
  events: {
    /**
     * Ensure backend `users` row exists on every successful sign-in.
     * Relying only on the browser calling GET /api/me misses people when the first API call fails
     * or they never hit a page that loads the sidebar before an admin checks Team leaders.
     */
    async signIn({ user }) {
      const email = (user?.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) return;
      const candidates = [
        (process.env.BACKEND_API_URL ?? "").trim(),
        (process.env.NEXT_PUBLIC_API_URL ?? "").trim(),
      ]
        .filter(Boolean)
        .map((v) => v.replace(/\/$/, ""));
      if (candidates.length === 0) return;
      const name = (user?.name ?? "").trim();
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/me`, {
            method: "POST",
            headers: {
              "X-User-Email": email,
              "X-Login-Source": "oauth",
              ...(name ? { "X-User-Name": name } : {}),
            },
          });
          if (res.ok) return;
          console.warn("[auth] backend user sync:", base, res.status, await res.text().catch(() => ""));
        } catch (e) {
          console.warn("[auth] backend user sync failed:", base, e);
        }
      }
    },
  },
};
