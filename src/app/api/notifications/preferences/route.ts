import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { EARLIEST_SEND_HOUR, LATEST_SEND_HOUR } from "@/lib/notifications/schedule";
import { prisma } from "@/lib/prisma";

const preferenceSchema = z.object({
  dueReviewDigest: z.boolean(),
  weeklySummary: z.boolean(),
  sendHour: z.number().int().min(EARLIEST_SEND_HOUR).max(LATEST_SEND_HOUR),
});

const DEFAULTS = { dueReviewDigest: false, weeklySummary: false, sendHour: 18 };

async function getPreferences(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(request, "notification-preferences-read", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId: user.id },
    select: { dueReviewDigest: true, weeklySummary: true, sendHour: true },
  });
  return NextResponse.json({ ...(preference ?? DEFAULTS), emailVerified: user.emailVerified });
}

async function patchPreferences(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = preferenceSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid notification preferences", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "notification-preferences", { identity: user.id, identityLimit: 20 }, 15 * 60_000);
  if (limited) return limited;
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
    select: { dueReviewDigest: true, weeklySummary: true, sendHour: true },
  });
  return NextResponse.json({ ...preference, emailVerified: user.emailVerified });
}

export const GET = apiHandler("GET /api/notifications/preferences", getPreferences);
export const PATCH = apiHandler("PATCH /api/notifications/preferences", patchPreferences);
