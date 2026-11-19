"use client";

import { Baby, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, describeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

export type FamilyOverview = {
  activeLearnerId: string | null;
  self: { displayName: string | null; xp: number; currentStreak: number };
  children: Array<{ id: string; displayName: string; xp: number; currentStreak: number; dueReviews: number; knowledgeBand: { slug: string; name: string } | null }>;
  limit: number;
};

type GradeBandOption = { slug: string; name: string };

// Parents and guardians manage child profiles here. A child has no login: the
// guardian selects who is practicing from the sidebar on a shared device.
export function FamilyManager() {
  const auth = useAuth();
  const [family, setFamily] = useState<FamilyOverview | null>(null);
  const [bands, setBands] = useState<GradeBandOption[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [band, setBand] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [overview, profile] = await Promise.all([
        apiRequest<FamilyOverview>("/api/family"),
        apiRequest<{ gradeBands: GradeBandOption[] }>("/api/learner/profile"),
      ]);
      setFamily(overview);
      setBands(profile.gradeBands);
    } catch (cause) {
      setError(describeApiError(cause, "家庭成员加载失败。"));
    }
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [auth.status, load]);

  if (auth.status !== "authenticated" || !family) return null;

  async function addChild(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add"); setError("");
    try {
      await apiRequest("/api/family", { method: "POST", body: { displayName, knowledgeBand: band || null, guardianAttestation: attested } });
      setDisplayName(""); setBand(""); setAttested(false);
      await load();
    } catch (cause) {
      setError(describeApiError(cause, "添加失败，请稍后再试。"));
    } finally {
      setBusy("");
    }
  }

  async function removeChild(id: string, name: string) {
    if (!window.confirm(`删除“${name}”的学习档案吗？该档案的全部练习记录会被永久删除。`)) return;
    setBusy(id); setError("");
    try {
      await apiRequest("/api/family", { method: "DELETE", body: { learnerId: id } });
      await load();
    } catch (cause) {
      setError(describeApiError(cause, "删除失败；如果提示需要重新登录，请重新登录后再试。"));
    } finally {
      setBusy("");
    }
  }

  return <section aria-labelledby="family-title" className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-7">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky"><Baby size={20} /></span><div><h2 id="family-title" className="font-display text-xl font-black">孩子的学习档案</h2><p className="mt-1 text-sm font-semibold leading-6 text-muted">家长或监护人可以为孩子建立独立的学习档案，在同一台设备上切换练习。孩子不需要邮箱或密码；每个档案的进度只有你能看到。</p></div></div>
    {family.children.length ? <ul className="mt-5 space-y-2">{family.children.map((child) => <li key={child.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-canvas px-4 py-3 text-sm font-bold">
      <span className="font-black">{child.displayName}</span>
      <span className="text-muted">{child.knowledgeBand?.name ?? "未设定阶段"} · {child.xp} XP · 连续 {child.currentStreak} 天{child.dueReviews ? ` · ${child.dueReviews} 题待复习` : ""}</span>
      <button onClick={() => void removeChild(child.id, child.displayName)} disabled={Boolean(busy)} aria-label={`删除 ${child.displayName} 的学习档案`} className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:text-coral disabled:opacity-40">{busy === child.id ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}</button>
    </li>)}</ul> : null}
    {family.children.length < family.limit ? <form onSubmit={addChild} className="mt-5 grid gap-3 rounded-2xl border-2 border-dashed border-ink/10 p-4">
      <label className="text-sm font-black">孩子的称呼<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={30} placeholder="例如：小明" className="mt-1 min-h-11 w-full rounded-xl border-2 border-ink/10 px-3 text-sm font-semibold" /></label>
      <label className="text-sm font-black">学段（选填）<select value={band} onChange={(event) => setBand(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border-2 border-ink/10 px-3 text-sm"><option value="">不限定</option>{bands.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="flex items-start gap-2 text-xs font-bold leading-5"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="mt-0.5 size-4" />我是这个孩子的家长或法定监护人，同意代表孩子接受服务条款与隐私说明，并负责管理这份学习档案。</label>
      <button disabled={!displayName.trim() || !attested || Boolean(busy)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-40">{busy === "add" ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} 添加孩子</button>
    </form> : <p className="mt-4 text-xs font-bold text-muted">已达到 {family.limit} 个孩子档案的上限。</p>}
    {error ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
  </section>;
}
