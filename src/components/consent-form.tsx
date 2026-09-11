"use client";

import { ArrowRight, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { safeReturnPath } from "@/lib/auth-validation";
import type { ConsentBasis } from "@/lib/legal";
import { useAuth } from "@/lib/use-auth";

export function ConsentForm() {
  const auth = useAuth();
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
      const response = await fetch("/api/auth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentBasis: basis, acceptedTerms }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "暂时无法保存确认，请稍后重试。");
      await auth.refresh();
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法保存确认，请稍后重试。");
      setBusy(false);
    }
  }

  async function leave() {
    await auth.logout();
    router.replace("/practice");
    router.refresh();
  }

  if (auth.status !== "authenticated" || auth.user?.hasCurrentConsent) {
    return <main id="main-content" className="grid min-h-screen place-items-center bg-canvas p-6"><p role="status" className="font-bold text-muted">正在确认账号状态…</p></main>;
  }

  return <main id="main-content" className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-8 sm:px-6"><div className="dot-grid absolute inset-0 opacity-45" /><section className="relative w-full max-w-2xl rounded-[30px] border-2 border-ink bg-white p-6 shadow-[8px_9px_0_#242136] sm:p-9"><Link href="/practice" className="inline-flex items-center gap-2 font-display text-xl font-black"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link><div className="mt-7 flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><ShieldCheck size={18} /> Account consent</div><h1 className="mt-2 font-display text-3xl font-black tracking-tight">确认账号使用人与现行条款</h1><p className="mt-3 text-sm font-semibold leading-7 text-muted">持久账号会保存邮箱和学习记录。为保护未成年学习者，账号只能由年满 18 岁的学习者，或未成年学习者的父母、法定监护人创建和操作。未成年人可以继续使用不保存数据的访客练习。</p><form onSubmit={submit} className="mt-6 space-y-5"><fieldset><legend className="text-sm font-black">请选择符合你的身份</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{([{ value: "ADULT", label: "我是年满 18 岁的学习者" }, { value: "GUARDIAN", label: "我是父母或法定监护人" }] as const).map((option) => <label key={option.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 text-sm font-bold ${basis === option.value ? "border-violet bg-[#f0edff]" : "border-ink/10"}`}><input type="radio" name="consentBasis" required value={option.value} checked={basis === option.value} onChange={() => setBasis(option.value)} className="size-4 accent-violet" />{option.label}</label>)}</div></fieldset><label className="flex items-start gap-3 rounded-xl border-2 border-ink/10 bg-canvas/60 p-4 text-sm font-semibold leading-6"><input type="checkbox" required checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 size-4 shrink-0 accent-violet" /><span>我已阅读并接受 <Link href="/terms" target="_blank" className="font-black text-violet underline">服务条款</Link> 和 <Link href="/privacy-policy" target="_blank" className="font-black text-violet underline">隐私说明</Link>，并确认上述身份陈述真实。</span></label>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy || !basis || !acceptedTerms} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>接受并继续 <ArrowRight size={18} /></>}</button></form><button type="button" onClick={() => void leave()} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-muted hover:text-ink"><LogOut size={16} /> 不接受，退出并使用访客模式</button><p className="mt-3 text-xs font-semibold leading-5 text-muted">即使不接受条款，你仍可在 <Link href="/privacy" className="font-black text-violet underline">数据与隐私</Link> 页面行使已有账号的数据权利。</p></section></main>;
}
