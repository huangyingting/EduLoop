import { apiMessageError } from "@/lib/api";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTeacher } from "@/lib/user-roles";

export type TeacherResult = { teacher: SessionUser & { organizationId: string | null }; error?: never } | { teacher?: never; error: Response };

// Shared by the class routes: a signed-in account with the teacher role.
export async function teacherForRequest(request: Request): Promise<TeacherResult> {
  const user = await getSessionUser(request);
  if (!user) return { error: apiMessageError("signInRequired", 401, "UNAUTHORIZED") };
  if (!isTeacher(user)) return { error: apiMessageError("notTeacher", 403, "FORBIDDEN") };
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { organizationId: true } });
  return { teacher: { ...user, organizationId: account?.organizationId ?? null } };
}

export const CLASS_ID = /^[a-z0-9]{8,40}$/;
