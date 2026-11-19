import { createHmac, timingSafeEqual } from "node:crypto";
import { applicationAuthSecret } from "@/lib/auth-secret";

// A short-lived, signed proof that /api/questions/next served a question.
// Guests must present it to be graded, so the full answer key cannot be
// harvested by iterating question IDs. Signed-in learners are bounded by their
// account rate limits instead.

const TICKET_DOMAIN = "eduloop-question-ticket-v1";
export const QUESTION_TICKET_TTL_MS = 2 * 60 * 60_000;

function signature(secret: string, questionId: string, expiresAt: number) {
  return createHmac("sha256", secret).update(`${TICKET_DOMAIN}\n${questionId}\n${expiresAt}`).digest("base64url");
}

export function issueQuestionTicket(questionId: string, now = Date.now(), secret = applicationAuthSecret()) {
  if (!secret) throw new Error("A valid AUTH_SECRET is required to issue question tickets.");
  const expiresAt = now + QUESTION_TICKET_TTL_MS;
  return `${expiresAt.toString(36)}.${signature(secret, questionId, expiresAt)}`;
}

export function verifyQuestionTicket(ticket: string | undefined, questionId: string, now = Date.now(), secret = applicationAuthSecret()) {
  if (!ticket || !secret) return false;
  const [encodedExpiry, provided] = ticket.split(".");
  const expiresAt = Number.parseInt(encodedExpiry ?? "", 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now || expiresAt > now + QUESTION_TICKET_TTL_MS || !provided) return false;
  const expected = Buffer.from(signature(secret, questionId, expiresAt));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
