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

export const passwordChangeSchema = z.object({
  currentPassword: bcryptPassword(1),
  newPassword: bcryptPassword(8),
});

export const accountDeletionSchema = z.object({
  currentPassword: bcryptPassword(1),
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
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
    const host = forwardedHost || request.headers.get("host")?.trim() || requestUrl.host;
    const protocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);
    if (!host || !/^https?$/.test(protocol)) return false;
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
