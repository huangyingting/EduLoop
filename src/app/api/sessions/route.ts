import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { sessionRequestSchema } from "@/lib/contracts/practice";
import { findLearnerForRequest } from "@/lib/learner-identity";
import { startPracticeSession } from "@/lib/practice/sessions";

async function postSession(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = sessionRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid session", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "sessions",
    { identity: user.id, identityLimit: 20 },
  );
  if (limited) return limited;

  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const outcome = await startPracticeSession(learner.id, parsed.data);
  if (outcome.status === "CONFLICT") {
    return apiError("Another device changed the active session. Please retry.", 409, "CONFLICT");
  }
  return NextResponse.json(outcome.session, { status: outcome.status === "CREATED" ? 201 : 200 });
}

export const POST = apiHandler("POST /api/sessions", postSession);
