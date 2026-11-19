import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { createAssignment, deleteAssignment } from "@/lib/classes";
import { teacherForRequest } from "@/lib/classes-api";
import { createAssignmentSchema, deleteAssignmentSchema } from "@/lib/contracts/classes";

type Context = { params: Promise<{ id: string }> };

async function postAssignment(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const { teacher, error } = await teacherForRequest(request);
  if (error) return error;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createAssignmentSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("assignmentInvalid", 400, "INVALID_REQUEST", z.flattenError(parsed.error));
  const limited = await enforceRateLimit(request, "classes-assignments", { identity: teacher.id, identityLimit: 60 }, 60 * 60_000);
  if (limited) return limited;
  const outcome = await createAssignment(teacher.id, id, parsed.data);
  if (outcome.status === "NOT_FOUND") return apiError("Class not found", 404, "NOT_FOUND");
  if (outcome.status === "LIMIT_REACHED") return apiMessageError("assignmentLimit", 409, "CONFLICT");
  if (outcome.status !== "CREATED") return apiMessageError("assignmentInvalid", 400, "INVALID_REQUEST", { reason: outcome.status });
  return NextResponse.json(outcome.assignment, { status: 201 });
}

async function removeAssignment(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const { teacher, error } = await teacherForRequest(request);
  if (error) return error;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = deleteAssignmentSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid assignment", 400, "INVALID_REQUEST");
  return await deleteAssignment(teacher.id, id, parsed.data.assignmentId)
    ? NextResponse.json({ deleted: true })
    : apiError("Assignment not found", 404, "NOT_FOUND");
}

export const POST = apiHandler<Request, Context>("POST /api/classes/[id]/assignments", postAssignment);
export const DELETE = apiHandler<Request, Context>("DELETE /api/classes/[id]/assignments", removeAssignment);
