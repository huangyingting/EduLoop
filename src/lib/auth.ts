import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
export { isContentOperator } from "@/lib/user-roles";

export const SESSION_COOKIE = "eduloop_session";
export const SESSION_DURATION_DAYS = 30;
export const MAX_ACTIVE_SESSIONS = 10;
export const PASSWORD_HASH_COST = 12;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

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

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function createSessionRecord(userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (transaction) => {
    await transaction.authSession.deleteMany({ where: { expiresAt: { lte: now } } });
    const overflow = await transaction.authSession.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      skip: MAX_ACTIVE_SESSIONS - 1,
      select: { id: true },
    });
    if (overflow.length) {
      await transaction.authSession.deleteMany({ where: { id: { in: overflow.map(({ id }) => id) } } });
    }
    await transaction.authSession.create({
      data: { tokenHash: hashSessionToken(token), userId, expiresAt, createdAt: now },
    });
  });
  return { token, expiresAt };
}

export async function createSession(userId: string) {
  const { token, expiresAt } = await createSessionRecord(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
    priority: "high",
  });
}

export async function destroySession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    await prisma.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, email: true, displayName: true, role: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.authSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.user;
}
