import { createHmac, timingSafeEqual } from "node:crypto";
import { applicationAuthSecret } from "@/lib/auth-secret";
import { NOTIFICATION_TYPES, type NotificationType } from "./schedule";

// One-click unsubscribe links work without a login, so the link carries a
// signed, type-scoped token instead of a bare account identifier.

const UNSUBSCRIBE_DOMAIN = "eduloop-unsubscribe-v1";
const UNSUBSCRIBE_TTL_MS = 90 * 24 * 60 * 60_000;

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(`${UNSUBSCRIBE_DOMAIN}\n${payload}`).digest("base64url");
}

export function issueUnsubscribeToken(userId: string, type: NotificationType, now = Date.now(), secret = applicationAuthSecret()) {
  if (!secret) throw new Error("A valid AUTH_SECRET is required to sign unsubscribe links.");
  const payload = Buffer.from(JSON.stringify({ u: userId, t: type, e: now + UNSUBSCRIBE_TTL_MS })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined, now = Date.now(), secret = applicationAuthSecret()) {
  if (!token || !secret) return null;
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  const expected = Buffer.from(sign(secret, payload));
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; t?: unknown; e?: unknown };
    if (typeof decoded.u !== "string" || typeof decoded.e !== "number" || decoded.e < now) return null;
    if (!(NOTIFICATION_TYPES as readonly unknown[]).includes(decoded.t)) return null;
    return { userId: decoded.u, type: decoded.t as NotificationType };
  } catch {
    return null;
  }
}
