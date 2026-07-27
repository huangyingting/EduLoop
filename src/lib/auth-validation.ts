import { z } from "zod";

const emailSchema = z.string().trim().max(254).email();
const bcryptPassword = (minimum: number) => z.string().min(minimum).max(128).refine(
  (password) => new TextEncoder().encode(password).length <= 72,
  "Password must be at most 72 UTF-8 bytes.",
);

export const loginInputSchema = z.object({
  email: emailSchema,
  password: bcryptPassword(1),
  deviceKey: z.string().min(8).max(100),
});

export const registerInputSchema = z.object({
  email: emailSchema,
  password: bcryptPassword(8),
  displayName: z.string().trim().min(1).max(50).optional(),
  deviceKey: z.string().min(8).max(100),
});

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
