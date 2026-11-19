import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import {
  attemptRequestSchema,
  explanationViewRequestSchema,
  selfAssessmentRequestSchema,
} from "@/lib/contracts/practice";
import { ensureActiveLearner, findActiveLearner } from "@/lib/family";
import {
  assessWrittenAttempt,
  findAttemptQuestion,
  guestAttemptResult,
  recordExplanationView,
  recordLearnerAttempt,
} from "@/lib/practice/attempts";
import { gradeResponse } from "@/lib/practice/grading";
import { verifyQuestionTicket } from "@/lib/question-ticket";
import { contentLocale, questionTranslation } from "@/lib/question-translations";

const GUEST_DAILY_ATTEMPTS = 300;
const DAY_MS = 24 * 60 * 60_000;

async function postAttempt(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = attemptRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid attempt", 400, "INVALID_REQUEST", z.flattenError(parsed.error));
  const input = parsed.data;
  const user = await getSessionUser(request);
  const limited = await enforceRateLimit(
    request,
    "attempts",
    user
      ? { identity: user.id, identityLimit: 45 }
      : { addressLimit: 45 },
  );
  if (limited) return limited;

  const stored = await findAttemptQuestion(input.questionId);
  if (!stored) return apiError("Question not found", 404, "NOT_FOUND");
  // The explanation follows the language the question was shown in; grading
  // always uses the stored answer key.
  const translation = await questionTranslation(stored.id, contentLocale(request));
  const question = translation?.explanation ? { ...stored, explanation: translation.explanation } : stored;
  const grading = gradeResponse(question, input.response);
  if (!grading.ok) {
    return apiError(
      grading.reason === "RESPONSE_TYPE" ? "Invalid response type" : "Invalid response option",
      400,
      "INVALID_REQUEST",
    );
  }

  if (!user) {
    // Guests are graded only for questions actually served to them, and only
    // so many per address per day, so the answer key cannot be harvested.
    if (!verifyQuestionTicket(input.ticket, question.id)) {
      return apiError("A question ticket from /api/questions/next is required.", 403, "FORBIDDEN", { reason: "TICKET_REQUIRED" });
    }
    const daily = await enforceRateLimit(request, "guest-attempts-daily", { addressLimit: GUEST_DAILY_ATTEMPTS }, DAY_MS);
    if (daily) return daily;
    return NextResponse.json(guestAttemptResult(question, grading), { headers: { "Cache-Control": "no-store" } });
  }

  const learner = await ensureActiveLearner(request, user);
  const outcome = await recordLearnerAttempt({
    learnerId: learner.id,
    storedTimeZone: learner.timeZone,
    question,
    grading,
    input,
  });
  if (outcome.status === "CONFLICT") return apiError("Attempt key already used", 409, "CONFLICT");
  return NextResponse.json(outcome.result);
}

async function patchAttempt(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const explanationView = explanationViewRequestSchema.safeParse(body.value);
  if (explanationView.success) {
    const limited = await enforceRateLimit(request, "explanation-views", { identity: user.id, identityLimit: 90 });
    if (limited) return limited;
    const learner = await findActiveLearner(request, user);
    if (!learner) return apiError("Attempt not found", 404, "NOT_FOUND");
    const outcome = await recordExplanationView(learner.id, explanationView.data.attemptId);
    if (outcome.status === "RECORDED") return NextResponse.json({ recorded: true, viewedAt: outcome.viewedAt });
    if (outcome.status === "ALREADY_RECORDED") return NextResponse.json({ recorded: false, viewedAt: outcome.viewedAt });
    if (outcome.status === "NOT_FOUND") return apiError("Attempt not found", 404, "NOT_FOUND");
    return apiError("Explanation view is not eligible for this attempt", 409, "CONFLICT");
  }

  const parsed = selfAssessmentRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid self-assessment", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "assessments", { identity: user.id, identityLimit: 45 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  if (!learner) return apiError("Attempt not found", 404, "NOT_FOUND");

  const outcome = await assessWrittenAttempt(learner, parsed.data);
  if (outcome.status === "NOT_FOUND") return apiError("Attempt not found", 404, "NOT_FOUND");
  if (outcome.status === "ALREADY_ASSESSED") return apiError("Attempt already assessed", 409, "CONFLICT");
  return NextResponse.json({ isCorrect: outcome.isCorrect });
}

export const POST = apiHandler("POST /api/attempts", postAttempt);
export const PATCH = apiHandler("PATCH /api/attempts", patchAttempt);
