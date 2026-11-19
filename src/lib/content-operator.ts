import { NextResponse } from "next/server";
import { apiMessageError } from "@/lib/api";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { hasRecentAuthentication } from "@/lib/auth-validation";
import { isContentOperator } from "@/lib/user-roles";

export type ContentOperatorResult =
  | { user: SessionUser; error?: never }
  | { user?: never; error: NextResponse };

export async function contentOperatorForRequest(request: Request): Promise<ContentOperatorResult> {
  const user = await getSessionUser(request);
  if (!user) return { error: apiMessageError("signInRequired", 401, "UNAUTHORIZED") };
  if (!isContentOperator(user)) return { error: apiMessageError("notOperator", 403, "FORBIDDEN") };
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return { error: apiMessageError("reauthOperator", 401, "UNAUTHORIZED") };
  }
  return { user };
}
