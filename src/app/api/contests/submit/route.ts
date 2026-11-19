import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { submitContestRequestSchema } from "@/lib/contracts/contests";
import { findActiveLearner } from "@/lib/family";
import { submitContest } from "@/lib/practice/contests";
import { contentLocale, localizeContestView } from "@/lib/question-translations";

async function postSubmitContest(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = submitContestRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid contest submission", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "contest-submit", { identity: user.id, identityLimit: 10 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  if (!learner) return apiError("Contest session not found", 404, "NOT_FOUND");
  const outcome = await submitContest(learner.id, parsed.data.sessionId);
  if (outcome.status === "NOT_FOUND") return apiError("Contest session not found", 404, "NOT_FOUND");
  if (outcome.status === "CLOSED" || !outcome.result) return apiError("Contest session is closed", 409, "CONFLICT");
  return NextResponse.json(await localizeContestView(outcome.result, contentLocale(request)));
}

export const POST = apiHandler("POST /api/contests/submit", postSubmitContest);
