import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";
import { applicationAuthSecret } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";
import { hasCurrentLegalConsent } from "@/lib/legal";
export { isContentOperator } from "@/lib/user-roles";

export const SESSION_DURATION_DAYS = 30;
export const PASSWORD_HASH_COST = 12;
export const AUTH_SECRET_VALUE = applicationAuthSecret() ?? undefined;
export const AUTH_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export type SessionUser = {
  id: string;
  email: string;
  authenticatedAt: number;
  sessionVersion: number;
  displayName: string | null;
  image: string | null;
  role: string;
  emailVerified: boolean;
  hasPassword: boolean;
  hasCurrentConsent: boolean;
  oauthProviders: string[];
};

const passwordLoginUserSelect = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  image: true,
  passwordHash: true,
  sessionVersion: true,
  termsAcceptedAt: true,
  termsVersion: true,
  privacyAcceptedAt: true,
  privacyVersion: true,
  consentBasis: true,
} as const;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_HASH_COST);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function passwordHashNeedsUpgrade(passwordHash: string) {
  const match = passwordHash.match(/^\$2[aby]\$(\d{2})\$/);
  return !match || Number(match[1]) < PASSWORD_HASH_COST;
}

export async function authenticatePasswordCredentials(email: string, password: string) {
  let user = await prisma.user.findUnique({
    where: { email },
    select: passwordLoginUserSelect,
  });
  if (!user?.passwordHash) {
    // Keep the missing-account path expensive enough that it does not become
    // an obvious mailbox-enumeration timing oracle.
    await hashPassword(password);
    return null;
  }

  const authenticatedSessionVersion = user.sessionVersion;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!user.passwordHash || !await verifyPassword(password, user.passwordHash)) return null;
    const passwordHash = user.passwordHash;
    const upgradedHash = passwordHashNeedsUpgrade(passwordHash)
      ? await hashPassword(password)
      : null;
    const claimed = await prisma.user.updateMany({
      where: {
        id: user.id,
        passwordHash,
        sessionVersion: authenticatedSessionVersion,
      },
      data: upgradedHash
        ? { passwordHash: upgradedHash }
        : { sessionVersion: { increment: 0 } },
    });
    if (claimed.count === 1) {
      return { ...user, authenticatedSessionVersion };
    }

    // Two valid logins can race while upgrading the same legacy hash. Permit
    // one retry only when the exact security version originally authenticated
    // is still current and the newly stored hash proves the same password.
    // Password changes and session revocations increment that version, so a
    // delayed old-password login can never adopt their newer security state.
    if (attempt === 0) {
      user = await prisma.user.findUnique({
        where: { id: user.id },
        select: passwordLoginUserSelect,
      });
      if (!user || user.sessionVersion !== authenticatedSessionVersion) return null;
    }
  }
  return null;
}

export async function getSessionUser(
  request: Request,
  options: { allowMissingConsent?: boolean } = {},
): Promise<SessionUser | null> {
  if (!AUTH_SECRET_VALUE) throw new Error("A valid AUTH_SECRET is required in production.");
  const token = await getToken({
    req: request,
    secret: AUTH_SECRET_VALUE,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: AUTH_SESSION_COOKIE,
    salt: AUTH_SESSION_COOKIE,
  });
  if (!token?.sub || typeof token.sessionVersion !== "number") return null;

  const user = await prisma.user.findUnique({
    where: { id: token.sub },
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
      accounts: { select: { provider: true }, orderBy: { provider: "asc" } },
    },
  });
  if (!user || user.sessionVersion !== token.sessionVersion) return null;
  const hasCurrentConsent = hasCurrentLegalConsent(user);
  if (!hasCurrentConsent && !options.allowMissingConsent) return null;
  return {
    id: user.id,
    email: user.email,
    authenticatedAt: typeof token.authenticatedAt === "number" ? token.authenticatedAt : 0,
    sessionVersion: user.sessionVersion,
    displayName: user.name,
    image: user.image,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    hasCurrentConsent,
    oauthProviders: user.accounts.map(({ provider }) => provider),
  };
}
