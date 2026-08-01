import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import {
  AUTH_SECRET_VALUE,
  AUTH_SESSION_COOKIE,
  SESSION_DURATION_DAYS,
  authenticatePasswordCredentials,
  getSessionUser,
} from "@/lib/auth";
import { credentialMinimizingAdapter } from "@/lib/auth-adapter";
import { hasRecentAuthentication, loginInputSchema, normalizeEmail } from "@/lib/auth-validation";
import { googleProfileHasVerifiedEmail, providerProfileVerifiesEmail } from "@/lib/email-assurance";
import { ensureLearnerForUser } from "@/lib/learner-identity";
import { hasCurrentLegalConsent } from "@/lib/legal";
import { errorLogMetadata, safeLogToken } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import {
  linkProviderAccountSafely,
  providerAuthenticationSnapshot,
  providerSessionVersionForAuthentication,
  type ProviderAuthenticationSnapshot,
} from "@/lib/provider-account";
import {
  addressRateLimitKey,
  checkRateLimit,
  clientAddress,
  identityRateLimitKey,
} from "@/lib/rate-limit";

class EmailNotVerified extends CredentialsSignin {
  code = "email_not_verified";
}

function configuredPair(id: string | undefined, secret: string | undefined) {
  return Boolean(id?.trim() && secret?.trim());
}

function hasAuthSessionCookie(request: Request | undefined) {
  const header = request?.headers.get("cookie") ?? "";
  return header.split(";").some((item) => {
    const name = item.trim().split("=", 1)[0];
    return name === AUTH_SESSION_COOKIE || name.startsWith(`${AUTH_SESSION_COOKIE}.`);
  });
}

function normalizedProfileEmail(value: unknown) {
  if (typeof value !== "string" || !value.includes("@")) return null;
  return normalizeEmail(value);
}

const providerAuthenticationSnapshots = new WeakMap<Request, ProviderAuthenticationSnapshot>();

function socialProviders(): Provider[] {
  const providers: Provider[] = [];
  if (configuredPair(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET)) {
    providers.push(Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: { params: { prompt: "select_account" } },
      profile(profile) {
        return {
          id: String(profile.sub),
          name: typeof profile.name === "string" ? profile.name : null,
          email: normalizedProfileEmail(profile.email),
          image: typeof profile.picture === "string" ? profile.picture : null,
        };
      },
    }));
  }
  if (configuredPair(process.env.AUTH_MICROSOFT_ENTRA_ID_ID, process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET)) {
    const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
      || "https://login.microsoftonline.com/common/v2.0";
    providers.push(MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer,
      profile(profile) {
        return {
          id: String(profile.sub),
          name: typeof profile.name === "string" ? profile.name : null,
          email: normalizedProfileEmail(profile.email ?? profile.preferred_username),
          image: null,
        };
      },
    }));
  }
  if (configuredPair(process.env.AUTH_FACEBOOK_ID, process.env.AUTH_FACEBOOK_SECRET)) {
    const version = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v23.0";
    providers.push(Facebook({
      clientId: process.env.AUTH_FACEBOOK_ID!,
      clientSecret: process.env.AUTH_FACEBOOK_SECRET!,
      authorization: `https://www.facebook.com/${version}/dialog/oauth?scope=email`,
      token: `https://graph.facebook.com/${version}/oauth/access_token`,
      userinfo: `https://graph.facebook.com/${version}/me?fields=id,name,email,picture`,
      profile(profile) {
        return {
          id: String(profile.id),
          name: typeof profile.name === "string" ? profile.name : null,
          email: normalizedProfileEmail(profile.email),
          image: profile.picture?.data?.url ?? null,
        };
      },
    }));
  }
  return providers;
}

export const { handlers, auth } = NextAuth((request) => ({
  adapter: credentialMinimizingAdapter(PrismaAdapter(prisma), {
    linkAccount(account) {
      return linkProviderAccountSafely(
        account,
        request ? providerAuthenticationSnapshots.get(request)?.sessionVersion : undefined,
      );
    },
  }),
  secret: AUTH_SECRET_VALUE,
  trustHost: process.env.NODE_ENV !== "production" || Boolean(process.env.AUTH_URL || process.env.AUTH_TRUST_HOST),
  useSecureCookies: process.env.NODE_ENV === "production",
  session: {
    strategy: "jwt",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      name: "邮箱和密码",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials, authRequest) {
        const parsed = loginInputSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = normalizeEmail(parsed.data.email);
        const addressRate = await checkRateLimit(
          addressRateLimitKey("auth-login", clientAddress(authRequest)),
          50,
          15 * 60_000,
        );
        if (!addressRate.allowed) return null;
        const identityRate = await checkRateLimit(
          identityRateLimitKey("auth-login", email),
          10,
          15 * 60_000,
        );
        if (!identityRate.allowed) return null;

        const user = await authenticatePasswordCredentials(email, parsed.data.password);
        if (!user) return null;
        if (!user.emailVerified) throw new EmailNotVerified();
        if (hasCurrentLegalConsent(user)) await ensureLearnerForUser(user.id, user.name);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          authenticatedSessionVersion: user.authenticatedSessionVersion,
        };
      },
    }),
    ...socialProviders(),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google" && !googleProfileHasVerifiedEmail(profile)) return false;
      if (account?.type === "oauth" || account?.type === "oidc") {
        if (!user.email || !request) return false;
        // Auth.js can link a new provider to the user identified by an existing
        // JWT. Validate EduLoop's database session version before allowing that
        // high-impact operation; decoding the encrypted token alone is not
        // sufficient after password rotation or explicit revocation.
        if (hasAuthSessionCookie(request)) {
          const currentUser = await getSessionUser(request);
          if (currentUser && hasRecentAuthentication(currentUser.authenticatedAt)) {
            providerAuthenticationSnapshots.set(request, {
              userId: currentUser.id,
              sessionVersion: currentUser.sessionVersion,
            });
          } else {
            // A stale cookie must not prevent a user from signing in again with
            // an already connected provider. Treat it as a normal provider
            // login, never as authority to link a new identity.
            const snapshot = await providerAuthenticationSnapshot(
              account.provider,
              account.providerAccountId,
            );
            if (!snapshot || snapshot.userId !== user.id) return false;
            providerAuthenticationSnapshots.set(request, snapshot);
          }
        } else {
          // A normal provider login must stay bound to the exact account
          // connection observed after the provider proof. If that connection
          // is removed or its security version changes before cookie issuance,
          // the JWT callback rejects the stale login.
          const snapshot = await providerAuthenticationSnapshot(
            account.provider,
            account.providerAccountId,
          );
          if (snapshot) {
            if (snapshot.userId !== user.id) return false;
            providerAuthenticationSnapshots.set(request, snapshot);
          }
        }
        return true;
      }
      return true;
    },
    async jwt({ token, user, account, isNewUser }) {
      const userId = user?.id || token.sub;
      if (!userId) return null;
      const stored = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          emailVerified: true,
          passwordHash: true,
          sessionVersion: true,
          termsAcceptedAt: true,
          termsVersion: true,
          privacyAcceptedAt: true,
          privacyVersion: true,
          consentBasis: true,
          accounts: {
            select: { provider: true, providerAccountId: true },
            orderBy: { provider: "asc" },
          },
        },
      });
      if (!stored) return null;
      if (user) token.authenticatedAt = Math.floor(Date.now() / 1000);
      if (user && token.sessionVersion === undefined) {
        if (account?.provider === "credentials") {
          if (typeof user.authenticatedSessionVersion !== "number") return null;
          token.sessionVersion = user.authenticatedSessionVersion;
        } else if (account?.type === "oauth" || account?.type === "oidc") {
          const connectionStillPresent = stored.accounts.some((connection) => (
            connection.provider === account.provider
            && connection.providerAccountId === account.providerAccountId
          ));
          if (!connectionStillPresent) return null;
          const providerVersion = providerSessionVersionForAuthentication(
            request ? providerAuthenticationSnapshots.get(request) : null,
            stored.id,
            isNewUser === true,
            stored.sessionVersion,
          );
          if (providerVersion === null) return null;
          token.sessionVersion = providerVersion;
        } else {
          return null;
        }
      }
      if (token.sessionVersion !== stored.sessionVersion) return null;
      token.sub = stored.id;
      token.email = stored.email;
      token.name = stored.name;
      token.picture = stored.image;
      token.role = stored.role;
      token.emailVerified = Boolean(stored.emailVerified);
      token.hasPassword = Boolean(stored.passwordHash);
      token.hasCurrentConsent = hasCurrentLegalConsent(stored);
      token.oauthProviders = stored.accounts.map(({ provider }) => provider);
      return token;
    },
    session({ session, token }) {
      if (!session.user || !token.sub || typeof token.email !== "string") return session;
      session.user.id = token.sub;
      session.user.email = token.email;
      session.user.authenticatedAt = typeof token.authenticatedAt === "number" ? token.authenticatedAt : 0;
      session.user.displayName = typeof token.name === "string" ? token.name : null;
      session.user.image = typeof token.picture === "string" ? token.picture : null;
      session.user.role = typeof token.role === "string" ? token.role : "LEARNER";
      session.user.isEmailVerified = token.emailVerified === true;
      session.user.hasPassword = token.hasPassword === true;
      session.user.hasCurrentConsent = token.hasCurrentConsent === true;
      session.user.oauthProviders = Array.isArray(token.oauthProviders)
        ? token.oauthProviders.filter((provider): provider is string => typeof provider === "string")
        : [];
      return session;
    },
  },
  events: {
    async signIn({ account, profile, user }) {
      if (!user.id) return;
      if (
        (account?.type === "oauth" || account?.type === "oidc")
        && providerProfileVerifiesEmail(account.provider, profile, user.email)
      ) {
        await prisma.$transaction([
          prisma.user.updateMany({
            where: { id: user.id, emailVerified: null },
            data: { emailVerified: new Date(), registrationExpiresAt: null },
          }),
          prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
        ]);
      }
      const consent = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          termsAcceptedAt: true,
          termsVersion: true,
          privacyAcceptedAt: true,
          privacyVersion: true,
          consentBasis: true,
        },
      });
      if (consent && hasCurrentLegalConsent(consent)) {
        await ensureLearnerForUser(user.id, user.name ?? null);
      }
    },
  },
  logger: {
    error(error) {
      console.error(JSON.stringify({
        level: "error",
        event: "authjs_error",
        ...errorLogMetadata(error),
        authErrorType: safeLogToken("type" in error ? error.type : undefined),
      }));
    },
  },
}));
