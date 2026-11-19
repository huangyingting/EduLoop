import { USER_ROLE, type UserRole } from "@/lib/domain-constants";

export const USER_ROLES = [USER_ROLE.LEARNER, USER_ROLE.CONTENT_EDITOR, USER_ROLE.ADMIN] as const;
export type { UserRole };

export function isContentOperator(user: { role: string } | null | undefined) {
  return user?.role === USER_ROLE.CONTENT_EDITOR || user?.role === USER_ROLE.ADMIN;
}
