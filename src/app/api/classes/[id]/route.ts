import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { classroomDashboard, updateClassroom } from "@/lib/classes";
import { CLASS_ID, teacherForRequest } from "@/lib/classes-api";
import { updateClassroomSchema } from "@/lib/contracts/classes";

type Context = { params: Promise<{ id: string }> };

async function getClass(request: Request, context: Context) {
  const { teacher, error } = await teacherForRequest(request);
  if (error) return error;
  const { id } = await context.params;
  if (!CLASS_ID.test(id)) return apiError("Class not found", 404, "NOT_FOUND");
  const limited = await enforceRateLimit(request, "classes-dashboard", { identity: teacher.id, identityLimit: 60 });
  if (limited) return limited;
  const dashboard = await classroomDashboard(teacher.id, id);
  return dashboard ? NextResponse.json(dashboard) : apiError("Class not found", 404, "NOT_FOUND");
}

async function patchClass(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const { teacher, error } = await teacherForRequest(request);
  if (error) return error;
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = updateClassroomSchema.safeParse(body.value);
  if (!parsed.success || !CLASS_ID.test(id)) return apiError("Invalid class update", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "classes-update", { identity: teacher.id, identityLimit: 30 }, 15 * 60_000);
  if (limited) return limited;
  const classroom = await updateClassroom(teacher.id, id, parsed.data);
  return classroom ? NextResponse.json(classroom) : apiError("Class not found", 404, "NOT_FOUND");
}

export const GET = apiHandler<Request, Context>("GET /api/classes/[id]", getClass);
export const PATCH = apiHandler<Request, Context>("PATCH /api/classes/[id]", patchClass);
