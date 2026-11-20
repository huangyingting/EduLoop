"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { AttemptResult, LearnerSnapshot } from "@/lib/contracts/practice";
import { clearGuestLearningStorage, getTimeZone } from "@/lib/learner";
import { useT } from "@/i18n/client";
import { useAuth } from "@/lib/use-auth";

export type { LearnerSnapshot };
type AttemptStats = Pick<AttemptResult, "totalXp" | "level" | "currentStreak" | "streakFreezes" | "todayAttempts">;

const initialSnapshot: LearnerSnapshot = { xp: 0, level: 1, currentStreak: 0, bestStreak: 0, streakFreezes: 1, todayAttempts: 0 };
const LearnerContext = createContext<{
  stats: LearnerSnapshot;
  refresh: () => Promise<void>;
  applyAttempt: (result: AttemptStats) => void;
} | null>(null);

export function LearnerProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState(initialSnapshot);
  const { status: authStatus, user } = useAuth();
  const refreshGeneration = useRef(0);
  const userId = user?.id;
  const hasCurrentConsent = user?.hasCurrentConsent === true;
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    if (authStatus !== "authenticated" || !userId || !hasCurrentConsent) {
      setStats(initialSnapshot);
      return;
    }
    setStats(initialSnapshot);
    try {
      const snapshot = await apiRequest<LearnerSnapshot>("/api/learner", { query: { timeZone: getTimeZone() } });
      if (generation === refreshGeneration.current) setStats(snapshot);
    } catch {
      // The authenticated UI remains usable with neutral stats while offline.
    }
  }, [authStatus, hasCurrentConsent, userId]);

  useEffect(() => {
    if (authStatus === "guest") clearGuestLearningStorage();
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [authStatus, refresh]);

  const value = useMemo(() => ({
    stats, refresh,
    applyAttempt: (result: AttemptStats) => setStats((current) => ({
      ...current, xp: result.totalXp, level: result.level, currentStreak: result.currentStreak,
      bestStreak: Math.max(current.bestStreak, result.currentStreak), streakFreezes: result.streakFreezes,
      todayAttempts: result.todayAttempts,
    })),
  }), [refresh, stats]);
  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner() {
  const context = useContext(LearnerContext);
  if (!context) throw new Error("useLearner must be used inside LearnerProvider");
  return context;
}

export function LearnerHeaderStats() {
  const { stats } = useLearner();
  const auth = useAuth();
  const t = useT();
  if (auth.status !== "authenticated") return null;
  return (
    <div className="hidden items-center gap-3 sm:flex">
      <div className="flex items-center gap-2 rounded-full border-2 border-ink/10 bg-white px-4 py-2 text-sm font-black shadow-[0_4px_0_#e3dfd4]">🔥 {t("shell.streakDays", { count: stats.currentStreak })}</div>
      <div className="flex items-center gap-2 rounded-full border-2 border-sky/20 bg-[#eaf8ff] px-3 py-2 text-sm font-black" title={t("shell.streakFreezeTitle")}>🛡️ {stats.streakFreezes}</div>
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-black text-white">✦ {stats.xp} XP</div>
    </div>
  );
}
