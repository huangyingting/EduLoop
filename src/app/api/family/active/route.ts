import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { ACTIVE_LEARNER_COOKIE, isManagedChild } from "@/lib/family";

const selectSchema = z.object({ learnerId: z.string().min(8).max(100).nullable() });

// Chooses who is practicing on this device: the account holder (null) or one
// of the child profiles this account manages.
async function postActiveLearner(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = selectSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid learner selection", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "family-select", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learnerId = parsed.data.learnerId;
  if (learnerId && !await isManagedChild(user.id, learnerId)) return apiError("Child profile not found", 404, "NOT_FOUND");
  const response = NextResponse.json({ activeLearnerId: learnerId });
  response.cookies.set(ACTIVE_LEARNER_COOKIE, learnerId ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: learnerId ? 30 * 24 * 60 * 60 : 0,
  });
  return response;
}

export const POST = apiHandler("POST /api/family/active", postActiveLearner);
