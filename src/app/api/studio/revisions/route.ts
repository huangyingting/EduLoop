import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { contentOperatorForRequest } from "@/lib/content-operator";
import { createRevision, reviewRevision } from "@/lib/studio/revisions";

export const runtime = "nodejs";

const optionSchema = z.object({ label: z.string().regex(/^[A-E]$/), content: z.string().max(2000) });
const createSchema = z.object({
  questionId: z.string().min(8).max(100),
  stem: z.string().trim().min(1).max(10_000),
  options: z.array(optionSchema).max(5).refine((options) => new Set(options.map(({ label }) => label)).size === options.length, "Duplicate option labels"),
  answer: z.string().trim().min(1).max(5_000),
  correctLabels: z.array(z.string().regex(/^[A-E]$/)).max(5),
  explanation: z.string().trim().max(20_000).nullable(),
  topicTagIds: z.array(z.string().min(1).max(100)).max(10).nullable(),
  reason: z.string().trim().min(3).max(500),
});
const reviewSchema = z.object({
  revisionId: z.string().min(8).max(100),
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

async function postRevision(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid revision", 400, "INVALID_REQUEST", z.flattenError(parsed.error));
  const limited = await enforceRateLimit(request, "studio-revisions", { identity: operator.user.id, identityLimit: 60 }, 10 * 60_000);
  if (limited) return limited;
  const outcome = await createRevision(parsed.data, operator.user.id);
  if (outcome.status === "NOT_FOUND") return apiError("Question not found", 404, "NOT_FOUND");
  if (outcome.status === "INVALID_ANSWER_KEY") return apiError("The answer key must use existing option labels", 400, "INVALID_REQUEST");
  return NextResponse.json({ id: outcome.revision.id, status: outcome.revision.status }, { status: 201 });
}

async function patchRevision(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = reviewSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid revision review", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "studio-revision-reviews", { identity: operator.user.id, identityLimit: 60 }, 10 * 60_000);
  if (limited) return limited;
  const outcome = await reviewRevision(parsed.data.revisionId, parsed.data.action, operator.user, parsed.data.note || null);
  if (outcome.status === "NOT_FOUND") return apiError("Revision not found", 404, "NOT_FOUND");
  if (outcome.status === "SECURITY_CONFLICT") return apiError("Your session changed; sign in again.", 409, "CONFLICT");
  if (outcome.status === "STATE_CONFLICT") return apiError("The revision was already reviewed.", 409, "CONFLICT");
  if (outcome.status === "SECOND_APPROVER_REQUIRED") return apiError("Another editor must approve an answer-key change.", 409, "CONFLICT", { reason: "SECOND_APPROVER_REQUIRED" });
  return NextResponse.json(outcome);
}

export const POST = apiHandler("POST /api/studio/revisions", postRevision);
export const PATCH = apiHandler("PATCH /api/studio/revisions", patchRevision);
