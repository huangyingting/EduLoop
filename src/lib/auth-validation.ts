import { z } from "zod";
import { catalogSlugSchema } from "@/lib/learner-profile";
import { CONSENT_BASES } from "@/lib/legal";
import { SOCIAL_PROVIDER_IDS } from "@/lib/social-providers";

export const SENSITIVE_ACTION_MAX_AGE_SECONDS = 10 * 60;

const emailSchema = z.string().trim().max(254).email();
const bcryptPassword = (minimum: number) => z.string().min(minimum).max(128).refine(
  (password) => new TextEncoder().encode(password).length <= 72,
  "Password must be at most 72 UTF-8 bytes.",
);

export const loginInputSchema = z.object({
  email: emailSchema,
  password: bcryptPassword(1),
});

export const legalConsentSchema = z.object({
  acceptedTerms: z.literal(true),
  consentBasis: z.enum(CONSENT_BASES),
});

export const registerInputSchema = z.object({
  email: emailSchema,
  password: bcryptPassword(8),
  displayName: z.string().trim().min(1).max(50).optional(),
  knowledgeBand: catalogSlugSchema.optional(),
}).and(legalConsentSchema);

export const passwordChangeSchema = z.object({
  currentPassword: bcryptPassword(1).optional(),
  newPassword: bcryptPassword(8),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const emailVerificationRequestSchema = z.object({
  email: emailSchema,
});

export const emailVerificationCompletionSchema = z.object({
  token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

export const emailChangeRequestSchema = z.object({
  newEmail: emailSchema,
  currentPassword: bcryptPassword(1).optional(),
});

export const emailChangeCompletionSchema = z.object({
  token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

export const providerDisconnectSchema = z.object({
  provider: z.enum(SOCIAL_PROVIDER_IDS),
});

export const passwordResetCompletionSchema = z.object({
  token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
  newPassword: bcryptPassword(8),
});

export const accountDeletionSchema = z.object({
  currentPassword: bcryptPassword(1).optional(),
  emailConfirmation: emailSchema.optional(),
}).refine((value) => value.currentPassword || value.emailConfirmation, "Account confirmation is required.");

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hasRecentAuthentication(authenticatedAt: number, nowSeconds = Math.floor(Date.now() / 1000)) {
  const age = nowSeconds - authenticatedAt;
  return Number.isFinite(authenticatedAt) && age >= -60 && age <= SENSITIVE_ACTION_MAX_AGE_SECONDS;
}

export function safeReturnPath(value: string | null | undefined) {
  if (
    !value
    || !value.startsWith("/")
    || value.startsWith("//")
    || /[\\\u0000-\u001f\u007f]/.test(value)
    || /%5c/i.test(value)
  ) return "/";
  try {
    const base = new URL("https://eduloop.invalid");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return "/";
    if (/^\/(?:login|register|forgot-password|reset-password|verify-email|change-email|consent|api)(?:\/|$)/.test(target.pathname)) return "/";
    return value;
  } catch {
    return "/";
  }
}

type AuthOriginEnvironment = { AUTH_URL?: string };

function configuredAuthOrigin(environment: AuthOriginEnvironment) {
  const configured = environment.AUTH_URL?.trim();
  if (!configured) return undefined;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(
  request: Request,
  environment: AuthOriginEnvironment = { AUTH_URL: process.env.AUTH_URL },
) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const publicOrigin = configuredAuthOrigin(environment);
    if (publicOrigin === null) return false;
    if (publicOrigin) return new URL(origin).origin === publicOrigin;

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
