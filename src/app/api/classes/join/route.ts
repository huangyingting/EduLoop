import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { joinClassroom, leaveClassroom } from "@/lib/classes";
import { joinClassroomSchema, leaveClassroomSchema } from "@/lib/contracts/classes";
import { ensureActiveLearner, findActiveLearner } from "@/lib/family";

// The active learner (the account holder, or a child profile on a guardian's
// device) joins with the code the teacher shares.
async function postJoin(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = joinClassroomSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("joinCodeInvalid", 400, "INVALID_REQUEST");
  // A tight limit keeps join codes from being guessed.
  const limited = await enforceRateLimit(request, "classes-join", { identity: user.id, identityLimit: 10 }, 15 * 60_000);
  if (limited) return limited;
  const learner = await ensureActiveLearner(request, user);
  const outcome = await joinClassroom(learner.id, parsed.data.code);
  if (outcome.status === "NOT_FOUND") return apiMessageError("joinCodeUnknown", 404, "NOT_FOUND");
  if (outcome.status === "FULL") return apiMessageError("classFull", 409, "CONFLICT");
  return NextResponse.json(outcome.classroom);
}

async function deleteJoin(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = leaveClassroomSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid class", 400, "INVALID_REQUEST");
  const learner = await findActiveLearner(request, user);
  if (!learner || !await leaveClassroom(learner.id, parsed.data.classroomId)) return apiError("Class not found", 404, "NOT_FOUND");
  return NextResponse.json({ left: true });
}

export const POST = apiHandler("POST /api/classes/join", postJoin);
export const DELETE = apiHandler("DELETE /api/classes/join", deleteJoin);
