import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

const localeSchema = z.object({ locale: z.enum(LOCALES) });

// Remembers the account's interface language so emails sent without a
// request (reminders and weekly summaries) use it.
async function putLocale(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = localeSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid locale", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "account-locale", { identity: user.id, identityLimit: 20 }, 15 * 60_000);
  if (limited) return limited;
  await prisma.user.update({ where: { id: user.id }, data: { locale: parsed.data.locale } });
  return NextResponse.json({ locale: parsed.data.locale });
}

export const PUT = apiHandler("PUT /api/auth/locale", putLocale);
