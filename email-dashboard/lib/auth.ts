import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import AzureADProvider from "next-auth/providers/azure-ad";

/** Delegated Graph send + OIDC; must match refresh_token request. */
const AZURE_LOGIN_SCOPES =
  "openid profile email offline_access https://graph.microsoft.com/Mail.Send";

/**
 * openid-client (used by NextAuth for Azure OIDC) defaults to 3500ms, which breaks on slow VPNs
 * and flaky networks. Override with AZURE_OAUTH_HTTP_TIMEOUT_MS (5000–120000).
 */
function azureOAuthHttpTimeoutMs(): number {
  const raw = process.env.AZURE_OAUTH_HTTP_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return 60_000;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 5_000) return 60_000;
  return Math.min(n, 120_000);
}

const AZURE_OAUTH_HTTP_TIMEOUT_MS = azureOAuthHttpTimeoutMs();

async function refreshAzureAccessToken(token: JWT): Promise<JWT> {
  const tenantId = process.env.AZURE_TENANT_ID ?? "";
  const clientId = process.env.AZURE_CLIENT_ID ?? "";
  const clientSecret = process.env.AZURE_CLIENT_SECRET ?? "";
  const refreshToken = token.refreshToken;
  if (!refreshToken || !tenantId || !clientId || !clientSecret) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: AZURE_LOGIN_SCOPES,
      }),
      signal: AbortSignal.timeout(AZURE_OAUTH_HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    console.warn("[auth] token refresh fetch failed", e);
    return { ...token, error: "RefreshAccessTokenError" };
  }
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
 * Uses `picture` from the OIDC profile when Azure sends it (optional claim); otherwise initials in the UI.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_TENANT_ID,
      httpOptions: {
        timeout: AZURE_OAUTH_HTTP_TIMEOUT_MS,
      },
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
          picture?: string | null;
        };
        const email = (p.email || p.preferred_username || "").trim() || null;
        const image =
          typeof p.picture === "string" && p.picture.trim() ? p.picture.trim() : null;
        return {
          id: p.sub ?? email ?? "unknown",
          name: p.name ?? email?.split("@")[0] ?? null,
          email,
          image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  trustHost: true,
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string | null | undefined) ?? session.user.name;
        session.user.email = (token.email as string | null | undefined) ?? session.user.email;
        session.user.image =
          (typeof token.picture === "string" && token.picture.trim() ? token.picture : null) ??
          session.user.image;
      }
      return session;
    },
    async jwt({ token, account, user }): Promise<JWT> {
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
        const image = user && "image" in user ? (user as { image?: string | null }).image : null;
        return {
          ...token,
          accessToken: acc.access_token,
          refreshToken: acc.refresh_token,
          expiresAt: exp,
          error: undefined,
          name: user?.name ?? token.name,
          email: user?.email ?? token.email,
          picture: image ?? token.picture,
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
