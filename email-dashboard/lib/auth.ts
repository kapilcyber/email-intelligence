import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import AzureADProvider from "next-auth/providers/azure-ad";

/** Delegated Graph send + OIDC; must match refresh_token request. */
const AZURE_LOGIN_SCOPES =
  "openid profile email offline_access https://graph.microsoft.com/Mail.Send";

async function refreshAzureAccessToken(token: JWT): Promise<JWT> {
  const tenantId = process.env.AZURE_TENANT_ID ?? "";
  const clientId = process.env.AZURE_CLIENT_ID ?? "";
  const clientSecret = process.env.AZURE_CLIENT_SECRET ?? "";
  const refreshToken = token.refreshToken;
  if (!refreshToken || !tenantId || !clientId || !clientSecret) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: AZURE_LOGIN_SCOPES,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    console.warn("[auth] token refresh failed", data.error ?? res.status);
    return { ...token, error: "RefreshAccessTokenError" };
  }
  const expiresIn = data.expires_in ?? 3600;
  return {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Math.floor(Date.now() / 1000 + expiresIn),
    error: undefined,
  };
}

/**
 * Azure AD sign-in with delegated Mail.Send for reply-all from the user's mailbox.
 * Overrides default `profile` so we do NOT call Graph `/me/photos` during sign-in.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_TENANT_ID,
      authorization: {
        params: {
          scope: AZURE_LOGIN_SCOPES,
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
  callbacks: {
    async jwt({ token, account }): Promise<JWT> {
      if (account) {
        const acc = account as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
        };
        const exp =
          typeof acc.expires_at === "number"
            ? acc.expires_at
            : Math.floor(Date.now() / 1000 + 3600);
        return {
          ...token,
          accessToken: acc.access_token,
          refreshToken: acc.refresh_token,
          expiresAt: exp,
          error: undefined,
        };
      }
      if (token.error === "RefreshAccessTokenError") {
        return token;
      }
      const expAt = token.expiresAt;
      if (typeof expAt === "number" && token.refreshToken) {
        const refreshIfBefore = expAt * 1000 - 120_000;
        if (Date.now() >= refreshIfBefore) {
          return refreshAzureAccessToken(token);
        }
      }
      return token;
    },
  },
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
