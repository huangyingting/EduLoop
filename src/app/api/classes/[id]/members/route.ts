import { NextResponse } from "next/server";
import { apiError, apiHandler, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { removeClassroomMember } from "@/lib/classes";
import { teacherForRequest } from "@/lib/classes-api";
import { removeMemberSchema } from "@/lib/contracts/classes";

type Context = { params: Promise<{ id: string }> };

async function deleteMember(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const { teacher, error } = await teacherForRequest(request);
  if (error) return error;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = removeMemberSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid member", 400, "INVALID_REQUEST");
  return await removeClassroomMember(teacher.id, id, parsed.data.learnerId)
    ? NextResponse.json({ removed: true })
    : apiError("Member not found", 404, "NOT_FOUND");
}

export const DELETE = apiHandler<Request, Context>("DELETE /api/classes/[id]/members", deleteMember);
