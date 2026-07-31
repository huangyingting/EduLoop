import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      authenticatedAt: number;
      displayName: string | null;
      role: string;
      isEmailVerified: boolean;
      hasPassword: boolean;
      hasCurrentConsent: boolean;
      oauthProviders: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authenticatedAt?: number;
    sessionVersion?: number;
    role?: string;
    emailVerified?: boolean;
    hasPassword?: boolean;
    hasCurrentConsent?: boolean;
    oauthProviders?: string[];
  }
}
