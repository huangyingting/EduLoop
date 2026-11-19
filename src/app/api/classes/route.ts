import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { createClassroom, learnerClassrooms, teacherClassrooms } from "@/lib/classes";
import { teacherForRequest } from "@/lib/classes-api";
import { createClassroomSchema } from "@/lib/contracts/classes";
import { findActiveLearner } from "@/lib/family";
import { isTeacher } from "@/lib/user-roles";

// The active learner's classes and assignments, plus the classes this account
// teaches when it has the teacher role.
async function getClasses(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(request, "classes-read", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  const [joined, teaching] = await Promise.all([
    learner ? learnerClassrooms(learner.id) : { classrooms: [] },
    isTeacher(user) ? teacherClassrooms(user.id) : null,
  ]);
  return NextResponse.json({ ...joined, teaching });
}

async function postClass(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const { teacher, error } = await teacherForRequest(request);
  if (error) return error;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createClassroomSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("classNameInvalid", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "classes-create", { identity: teacher.id, identityLimit: 20 }, 60 * 60_000);
  if (limited) return limited;
  const outcome = await createClassroom(teacher, parsed.data.name);
  if (outcome.status === "LIMIT_REACHED") return apiMessageError("classLimit", 409, "CONFLICT");
  return NextResponse.json(outcome.classroom, { status: 201 });
}

export const GET = apiHandler("GET /api/classes", getClasses);
export const POST = apiHandler("POST /api/classes", postClass);
