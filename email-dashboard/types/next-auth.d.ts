import "next-auth";

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError";
    /** Profile photo URL (OIDC `picture` claim), surfaced as `session.user.image`. */
    picture?: string | null;
  }
}

declare module "next-auth" {
  /** Supported at runtime (middleware / reverse proxy); omitted from some @types versions. */
  interface NextAuthOptions {
    trustHost?: boolean;
  }

  interface Session {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
