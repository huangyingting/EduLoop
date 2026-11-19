"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";
import type { FamilyOverview } from "./family-manager";

// Shown only to accounts that manage child profiles: choose who is practicing
// on this device. Switching reloads the page so every view shows that learner.
export function LearnerSwitcher() {
  const auth = useAuth();
  const [family, setFamily] = useState<FamilyOverview | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (auth.status !== "authenticated" || !auth.user?.hasCurrentConsent) return;
    const controller = new AbortController();
    apiRequest<FamilyOverview>("/api/family", { signal: controller.signal }).then(setFamily).catch(() => undefined);
    return () => controller.abort();
  }, [auth.status, auth.user?.hasCurrentConsent]);

  if (!family?.children.length) return null;

  async function select(learnerId: string) {
    setSwitching(true);
    try {
      await apiRequest("/api/family/active", { method: "POST", body: { learnerId: learnerId || null } });
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  return <label className="mt-3 block rounded-2xl border-2 border-ink/10 bg-white p-3 text-xs font-black text-muted">
    正在练习的学习者
    <select value={family.activeLearnerId ?? ""} disabled={switching} onChange={(event) => void select(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border-2 border-ink/10 px-2 text-sm font-black text-ink">
      <option value="">{family.self.displayName || "我自己"}</option>
      {family.children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}
    </select>
  </label>;
}
