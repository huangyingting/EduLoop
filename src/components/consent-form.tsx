"use client";

import { ArrowRight, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import { safeReturnPath } from "@/lib/auth-validation";
import type { ConsentBasis } from "@/lib/legal";
import { useAuth } from "@/lib/use-auth";

export function ConsentForm() {
  const auth = useAuth();
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeReturnPath(searchParams.get("next"));
  const [basis, setBasis] = useState<ConsentBasis | "">("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth.status === "guest") router.replace(`/login?next=${encodeURIComponent(`/consent?next=${encodeURIComponent(next)}`)}`);
    if (auth.status === "authenticated" && auth.user?.hasCurrentConsent) router.replace(next);
  }, [auth.status, auth.user?.hasCurrentConsent, next, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !basis || !acceptedTerms) return;
    setBusy(true); setError("");
    try {
      await apiRequest("/api/auth/consent", { method: "POST", body: { consentBasis: basis, acceptedTerms } });
      await auth.refresh();
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(describeApiError(cause, t("consent.saveFailed"), t));
      setBusy(false);
    }
  }

  async function leave() {
    await auth.logout();
    router.replace("/practice");
    router.refresh();
  }

  if (auth.status !== "authenticated" || auth.user?.hasCurrentConsent) {
    return <main id="main-content" className="grid min-h-screen place-items-center bg-canvas p-6"><p role="status" className="font-bold text-muted">{t("account.checking")}</p></main>;
  }

  return <main id="main-content" className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-8 sm:px-6"><div className="dot-grid absolute inset-0 opacity-45" /><section className="relative w-full max-w-2xl rounded-[30px] border-2 border-ink bg-white p-6 shadow-[8px_9px_0_#242136] sm:p-9"><Link href="/practice" className="inline-flex items-center gap-2 font-display text-xl font-black"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link><div className="mt-7 flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><ShieldCheck size={18} /> Account consent</div><h1 className="mt-2 font-display text-3xl font-black tracking-tight">{t("consent.title")}</h1><p className="mt-3 text-sm font-semibold leading-7 text-muted">{t("consent.body")}</p><form onSubmit={submit} className="mt-6 space-y-5"><fieldset><legend className="text-sm font-black">{t("consent.chooseIdentity")}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{([{ value: "ADULT", label: t("consent.adult") }, { value: "GUARDIAN", label: t("consent.guardian") }] as const).map((option) => <label key={option.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 text-sm font-bold ${basis === option.value ? "border-violet bg-[#f0edff]" : "border-ink/10"}`}><input type="radio" name="consentBasis" required value={option.value} checked={basis === option.value} onChange={() => setBasis(option.value)} className="size-4 accent-violet" />{option.label}</label>)}</div></fieldset><label className="flex items-start gap-3 rounded-xl border-2 border-ink/10 bg-canvas/60 p-4 text-sm font-semibold leading-6"><input type="checkbox" required checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 size-4 shrink-0 accent-violet" /><span>{t("consent.acceptPrefix")} <Link href="/terms" target="_blank" className="font-black text-violet underline">{t("shell.terms")}</Link> {t("auth.acceptAnd")} <Link href="/privacy-policy" target="_blank" className="font-black text-violet underline">{t("shell.privacyPolicy")}</Link>{t("consent.acceptSuffix")}</span></label>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy || !basis || !acceptedTerms} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{t("consent.submit")} <ArrowRight size={18} /></>}</button></form><button type="button" onClick={() => void leave()} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-muted hover:text-ink"><LogOut size={16} /> {t("consent.decline")}</button><p className="mt-3 text-xs font-semibold leading-5 text-muted">{t("consent.rightsPrefix")} <Link href="/privacy" className="font-black text-violet underline">{t("shell.dataPrivacy")}</Link> {t("consent.rightsSuffix")}</p></section></main>;
}
