import { NextRequest, NextResponse } from "next/server";
import { deleteLearningData } from "@/lib/account";
import { apiError, apiMessageError, apiHandler, enforceRateLimit } from "@/lib/api";
import { requestLocale, type Locale } from "@/i18n/config";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest } from "@/lib/auth-validation";
import { timeZoneQuerySchema } from "@/lib/contracts/practice";
import { emailConfiguration, sendLearningDataDeletedNotice } from "@/lib/email";
import { findActiveLearner } from "@/lib/family";
import { errorLogMetadata } from "@/lib/logging";
import { learnerSnapshot } from "@/lib/practice/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function notifyLearningDataDeletion(email: string, locale: Locale) {
  try {
    await sendLearningDataDeletedNotice(email, { locale });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "learning_data_deletion_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function getLearner(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const parsed = timeZoneQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid learner query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "learner-summary",
    { identity: user.id, identityLimit: 120 },
  );
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  return NextResponse.json(await learnerSnapshot(learner, parsed.data.timeZone));
}

async function deleteLearner(request: NextRequest) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthDeleteLearning", 401, "UNAUTHORIZED");
  }
  const parsed = timeZoneQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid learner query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "delete-learner",
    { identity: user.id, identityLimit: 3 },
    60 * 60_000,
  );
  if (limited) return limited;
  // Delete directly by account ownership so an account with no learner data is
  // never given an empty profile merely for the purpose of deleting it again.
  const outcome = await deleteLearningData(user.id, user.sessionVersion);
  if (outcome === "CONFLICT") {
    return apiMessageError("securityChanged", 409, "CONFLICT");
  }
  if (outcome === "DELETED" && emailConfiguration()) {
    await runAfterResponse(
      "learning_data_deletion_notice",
      () => notifyLearningDataDeletion(user.email, requestLocale(request)),
    );
  }
  return NextResponse.json({ deleted: outcome === "DELETED" });
}

export const GET = apiHandler("GET /api/learner", getLearner);
export const DELETE = apiHandler("DELETE /api/learner", deleteLearner);
