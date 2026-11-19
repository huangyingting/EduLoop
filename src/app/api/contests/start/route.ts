import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { startContestRequestSchema } from "@/lib/contracts/contests";
import { ensureActiveLearner } from "@/lib/family";
import { startContest } from "@/lib/practice/contests";

async function postStartContest(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = startContestRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid contest", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "contest-start", { identity: user.id, identityLimit: 10 });
  if (limited) return limited;
  const learner = await ensureActiveLearner(request, user);
  const outcome = await startContest(learner.id, parsed.data.paperKey);
  if (outcome.status === "UNAVAILABLE") return apiError("Contest paper not available", 404, "NOT_FOUND");
  if (outcome.status === "OTHER_ACTIVE") {
    return apiError("Another contest is still in progress", 409, "CONFLICT", { sessionId: outcome.sessionId, paperKey: outcome.paperKey });
  }
  return NextResponse.json(outcome.view, { status: outcome.status === "STARTED" ? 201 : 200 });
}

export const POST = apiHandler("POST /api/contests/start", postStartContest);
