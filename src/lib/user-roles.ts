export const USER_ROLES = ["LEARNER", "CONTENT_EDITOR", "ADMIN"] as const;
export type UserRole = typeof USER_ROLES[number];

export function isContentOperator(user: { role: string } | null | undefined) {
  return user?.role === "CONTENT_EDITOR" || user?.role === "ADMIN";
}
