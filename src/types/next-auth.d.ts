import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      authenticatedAt: number;
      displayName: string | null;
      role: string;
      hasPassword: boolean;
      oauthProviders: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authenticatedAt?: number;
    sessionVersion?: number;
    role?: string;
    hasPassword?: boolean;
    oauthProviders?: string[];
  }
}
