"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback } from "react";

export function useAuth() {
  const session = useSession();
  const refresh = useCallback(async () => {
    await session.update();
  }, [session]);
  const logout = useCallback(async () => {
    await signOut({ redirect: false });
  }, []);
  return {
    status: session.status === "authenticated" ? "authenticated" as const
      : session.status === "loading" ? "loading" as const
        : "guest" as const,
    user: session.data?.user ?? null,
    refresh,
    logout,
  };
}
