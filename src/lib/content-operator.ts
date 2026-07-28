import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { isContentOperator } from "@/lib/user-roles";

export type ContentOperatorResult =
  | { user: SessionUser; error?: never }
  | { user?: never; error: NextResponse };

export async function contentOperatorForRequest(request: Request): Promise<ContentOperatorResult> {
  const user = await getSessionUser(request);
  if (!user) return { error: apiError("请先登录。", 401, "UNAUTHORIZED") };
  if (!isContentOperator(user)) return { error: apiError("你没有内容审核权限。", 403, "FORBIDDEN") };
  return { user };
}
