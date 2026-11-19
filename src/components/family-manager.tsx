"use client";

import { Baby, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
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
  const t = useT();
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
      setError(describeApiError(cause, t("family.loadFailed"), t));
    }
  }, [t]);

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
      setError(describeApiError(cause, t("family.addFailed"), t));
    } finally {
      setBusy("");
    }
  }

  async function removeChild(id: string, name: string) {
    if (!window.confirm(t("family.confirmDelete", { name }))) return;
    setBusy(id); setError("");
    try {
      await apiRequest("/api/family", { method: "DELETE", body: { learnerId: id } });
      await load();
    } catch (cause) {
      setError(describeApiError(cause, t("family.deleteFailed"), t));
    } finally {
      setBusy("");
    }
  }

  return <section aria-labelledby="family-title" className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-7">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky"><Baby size={20} /></span><div><h2 id="family-title" className="font-display text-xl font-black">{t("family.title")}</h2><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("family.body")}</p></div></div>
    {family.children.length ? <ul className="mt-5 space-y-2">{family.children.map((child) => <li key={child.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-canvas px-4 py-3 text-sm font-bold">
      <span className="font-black">{child.displayName}</span>
      <span className="text-muted">{child.knowledgeBand?.name ?? t("family.noBand")} · {t("family.childStats", { xp: child.xp, streak: child.currentStreak })}{child.dueReviews ? t("family.childDue", { count: child.dueReviews }) : ""}</span>
      <button onClick={() => void removeChild(child.id, child.displayName)} disabled={Boolean(busy)} aria-label={t("family.deleteLabel", { name: child.displayName })} className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:text-coral disabled:opacity-40">{busy === child.id ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}</button>
    </li>)}</ul> : null}
    {family.children.length < family.limit ? <form onSubmit={addChild} className="mt-5 grid gap-3 rounded-2xl border-2 border-dashed border-ink/10 p-4">
      <label className="text-sm font-black">{t("family.childName")}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={30} placeholder={t("family.childNamePlaceholder")} className="mt-1 min-h-11 w-full rounded-xl border-2 border-ink/10 px-3 text-sm font-semibold" /></label>
      <label className="text-sm font-black">{t("family.bandOptional")}<select value={band} onChange={(event) => setBand(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border-2 border-ink/10 px-3 text-sm"><option value="">{t("family.anyBand")}</option>{bands.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="flex items-start gap-2 text-xs font-bold leading-5"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="mt-0.5 size-4" />{t("family.attestation")}</label>
      <button disabled={!displayName.trim() || !attested || Boolean(busy)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-40">{busy === "add" ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} {t("family.add")}</button>
    </form> : <p className="mt-4 text-xs font-bold text-muted">{t("family.limitReached", { limit: family.limit })}</p>}
    {error ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
  </section>;
}
