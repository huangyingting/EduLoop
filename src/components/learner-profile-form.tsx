"use client";

import { ArrowRight, Check, GraduationCap, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getPracticePreferences, savePracticePreferences } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";
import { CustomSelect } from "./custom-select";

type ProfilePayload = {
  displayName: string;
  knowledgeBand: string | null;
  knowledgeGrade: string | null;
  gradeBands: Array<{
    slug: string;
    name: string;
    grades: Array<{ slug: string; name: string }>;
  }>;
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function LearnerProfileForm() {
  const auth = useAuth();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [knowledgeBand, setKnowledgeBand] = useState("");
  const [knowledgeGrade, setKnowledgeGrade] = useState("");
  const [savedKnowledge, setSavedKnowledge] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status === "guest") return;
    const controller = new AbortController();
    void fetch("/api/learner/profile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, "学习档案加载失败。"));
        return response.json() as Promise<ProfilePayload>;
      })
      .then((payload) => {
        setProfile(payload);
        setDisplayName(payload.displayName);
        setKnowledgeBand(payload.knowledgeBand ?? "");
        setKnowledgeGrade(payload.knowledgeGrade ?? "");
        setSavedKnowledge(`${payload.knowledgeBand ?? ""}:${payload.knowledgeGrade ?? ""}`);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "学习档案加载失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.status]);

  if (auth.status === "loading") {
    return <div role="status" className="mt-7 grid min-h-64 place-items-center rounded-[28px] border-2 border-ink/10 bg-white"><div className="text-center text-sm font-bold text-muted"><LoaderCircle className="mx-auto mb-3 animate-spin text-violet" />正在整理学习档案…</div></div>;
  }
  if (auth.status === "guest") {
    return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-7 text-center"><GraduationCap className="mx-auto text-violet" size={38} /><h2 className="mt-4 font-display text-2xl font-black">登录后建立学习档案</h2><p className="mt-2 text-sm font-semibold text-muted">访客模式不会保存个人资料或练习偏好。</p><Link href="/login?next=%2Fprofile" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white">登录并继续 <ArrowRight size={17} /></Link></section>;
  }
  if (loading) {
    return <div role="status" className="mt-7 grid min-h-64 place-items-center rounded-[28px] border-2 border-ink/10 bg-white"><div className="text-center text-sm font-bold text-muted"><LoaderCircle className="mx-auto mb-3 animate-spin text-violet" />正在整理学习档案…</div></div>;
  }

  const selectedBand = profile?.gradeBands.find((band) => band.slug === knowledgeBand);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/learner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          knowledgeBand: knowledgeBand || null,
          knowledgeGrade: knowledgeGrade || null,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "学习档案保存失败。"));
      const payload = await response.json() as ProfilePayload;
      const nextKnowledge = `${payload.knowledgeBand ?? ""}:${payload.knowledgeGrade ?? ""}`;
      const preferences = getPracticePreferences();
      savePracticePreferences({
        ...preferences,
        gradeBand: payload.knowledgeBand ?? "",
        grade: payload.knowledgeGrade ?? "",
        ...(nextKnowledge !== savedKnowledge ? { subject: "", tags: "" } : {}),
      });
      setProfile(payload);
      setDisplayName(payload.displayName);
      setKnowledgeBand(payload.knowledgeBand ?? "");
      setKnowledgeGrade(payload.knowledgeGrade ?? "");
      setSavedKnowledge(nextKnowledge);
      await auth.refresh();
      setMessage("学习档案已保存，下一次进入练习时会使用新的推荐范围。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "学习档案保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={saveProfile} className="mt-7 space-y-5">
    <section className="rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-7">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-peach"><UserRound size={20} /></span><div><h2 className="font-display text-xl font-black">怎么称呼你</h2><p className="mt-1 text-sm font-semibold text-muted">昵称只会显示在你自己的学习空间中。</p></div></div>
      <label className="mt-5 block text-sm font-black">昵称（选填）<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} autoComplete="name" placeholder="例如：星空探索者" className="mt-2 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 px-4 text-sm font-semibold outline-none focus:border-violet focus:bg-white" /></label>
    </section>

    <section className="rounded-[28px] border-2 border-violet/20 bg-[#f0edff] p-6 sm:p-7">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-lime"><GraduationCap size={21} /></span><div><h2 className="font-display text-xl font-black">我目前适合的知识范围</h2><p className="mt-1 text-sm font-semibold leading-6 text-muted">这是缺省推荐，不是能力标签；你随时可以在练习页改成其他范围。</p></div></div>
      <div role="group" aria-label="知识阶段" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" aria-pressed={!knowledgeBand} onClick={() => { setKnowledgeBand(""); setKnowledgeGrade(""); }} className={`min-h-11 rounded-xl border-2 px-3 text-sm font-black transition ${!knowledgeBand ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-muted hover:border-violet/40"}`}>不限定阶段</button>
        {profile?.gradeBands.map((band) => <button key={band.slug} type="button" aria-pressed={knowledgeBand === band.slug} onClick={() => { setKnowledgeBand(band.slug); setKnowledgeGrade(""); }} className={`min-h-11 rounded-xl border-2 px-3 text-sm font-black transition ${knowledgeBand === band.slug ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-muted hover:border-violet/40"}`}>{band.name}</button>)}
      </div>
      {selectedBand?.grades.length ? <div className="mt-5"><span className="mb-2 block text-sm font-black">具体年级（选填）</span><CustomSelect label="具体年级" value={knowledgeGrade} options={[{ value: "", label: `${selectedBand.name}全部年级` }, ...selectedBand.grades.map((grade) => ({ value: grade.slug, label: grade.name }))]} onValueChange={setKnowledgeGrade} className="w-full" /></div> : null}
      <div className="mt-5 flex items-start gap-2 rounded-xl bg-white/70 px-4 py-3 text-xs font-semibold leading-5 text-muted"><Sparkles className="mt-0.5 shrink-0 text-violet" size={16} /><p>档案只在这台设备还没有手动筛选时提供缺省值。练习链接中的明确条件和你在练习页做出的选择始终优先。</p></div>
    </section>

    {message ? <p role="status" className="flex items-center gap-2 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]"><Check size={17} />{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-3"><button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-6 text-sm font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}保存学习档案</button><Link href="/practice" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black text-violet hover:bg-white">进入练习 <ArrowRight size={17} /></Link></div>
  </form>;
}
