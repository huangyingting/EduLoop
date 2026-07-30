import bcrypt from "bcryptjs";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
export { isContentOperator } from "@/lib/user-roles";

export const SESSION_DURATION_DAYS = 30;
export const PASSWORD_HASH_COST = 12;
export const AUTH_SECRET_VALUE = process.env.AUTH_SECRET
  || (process.env.NODE_ENV === "production" ? undefined : "eduloop-development-secret-change-before-production");
export const AUTH_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export type SessionUser = {
  id: string;
  email: string;
  authenticatedAt: number;
  displayName: string | null;
  image: string | null;
  role: string;
  hasPassword: boolean;
  oauthProviders: string[];
};

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

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  if (!AUTH_SECRET_VALUE) throw new Error("AUTH_SECRET is required in production.");
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
      passwordHash: true,
      sessionVersion: true,
      accounts: { select: { provider: true }, orderBy: { provider: "asc" } },
    },
  });
  if (!user || user.sessionVersion !== token.sessionVersion) return null;
  return {
    id: user.id,
    email: user.email,
    authenticatedAt: typeof token.authenticatedAt === "number" ? token.authenticatedAt : 0,
    displayName: user.name,
    image: user.image,
    role: user.role,
    hasPassword: Boolean(user.passwordHash),
    oauthProviders: user.accounts.map(({ provider }) => provider),
  };
}
