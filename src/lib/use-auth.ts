"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SessionUser } from "@/lib/auth";

type AuthState = {
  status: "loading" | "guest" | "authenticated";
  user: SessionUser | null;
};

let state: AuthState = { status: "loading", user: null };
const serverState: AuthState = { status: "loading", user: null };
let fetched = false;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  for (const listener of listeners) listener();
}

async function fetchMe() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const body = await response.json() as { user: SessionUser | null };
    setState(body.user
      ? { status: "authenticated", user: body.user }
      : { status: "guest", user: null });
  } catch {
    setState({ status: "guest", user: null });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!fetched) {
    fetched = true;
    void fetchMe();
  }
  return () => listeners.delete(listener);
}

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => serverState);
  const refresh = useCallback(() => fetchMe(), []);
  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("退出登录失败，请重试。");
    setState({ status: "guest", user: null });
  }, []);
  return { ...snapshot, refresh, logout };
}

export function setAuthenticatedUser(user: SessionUser) {
  fetched = true;
  setState({ status: "authenticated", user });
}
