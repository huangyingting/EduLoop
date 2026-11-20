import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { saveContestAnswersRequestSchema } from "@/lib/contracts/contests";
import { findActiveLearner } from "@/lib/family";
import { activeContestView, contestResult, saveContestAnswers } from "@/lib/practice/contests";
import { contentLocale, localizeContestView } from "@/lib/question-translations";

export const dynamic = "force-dynamic";

const querySchema = z.object({ id: z.string().min(8).max(100) });

// Returns the open paper while it is in progress and the scored result after
// submission.
async function getContestSession(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid contest session", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "contest-session", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  if (!learner) return apiError("Contest session not found", 404, "NOT_FOUND");
  const view = await activeContestView(learner.id, parsed.data.id) ?? await contestResult(learner.id, parsed.data.id);
  return view ? NextResponse.json(await localizeContestView(view, contentLocale(request))) : apiError("Contest session not found", 404, "NOT_FOUND");
}

async function patchContestSession(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = saveContestAnswersRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid contest answers", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "contest-answers", { identity: user.id, identityLimit: 120 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  if (!learner) return apiError("Contest session not found", 404, "NOT_FOUND");
  const outcome = await saveContestAnswers(learner.id, parsed.data.sessionId, parsed.data.answers);
  if (outcome.status === "NOT_FOUND") return apiError("Contest session not found", 404, "NOT_FOUND");
  if (outcome.status === "SAVED") return NextResponse.json({ answers: outcome.answers });
  return apiError(outcome.status === "EXPIRED" ? "Contest time is over" : "Contest answers changed; retry", 409, "CONFLICT", { reason: outcome.status });
}

export const GET = apiHandler("GET /api/contests/session", getContestSession);
export const PATCH = apiHandler("PATCH /api/contests/session", patchContestSession);
