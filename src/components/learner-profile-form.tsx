"use client";

import { ArrowRight, Check, Clock3, GraduationCap, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import { getPracticePreferences, getTimeZone, savePracticePreferences } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";
import { CustomSelect } from "./custom-select";

type ProfilePayload = {
  displayName: string;
  knowledgeBand: string | null;
  knowledgeGrade: string | null;
  timeZone: string | null;
  gradeBands: Array<{
    slug: string;
    name: string;
    grades: Array<{ slug: string; name: string }>;
  }>;
};

export function LearnerProfileForm() {
  const auth = useAuth();
  const t = useT();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [knowledgeBand, setKnowledgeBand] = useState("");
  const [knowledgeGrade, setKnowledgeGrade] = useState("");
  const [savedKnowledge, setSavedKnowledge] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [deviceTimeZone] = useState(() => getTimeZone());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status === "guest") return;
    const controller = new AbortController();
    void apiRequest<ProfilePayload>("/api/learner/profile", { signal: controller.signal })
      .then((payload) => {
        setProfile(payload);
        setDisplayName(payload.displayName);
        setKnowledgeBand(payload.knowledgeBand ?? "");
        setKnowledgeGrade(payload.knowledgeGrade ?? "");
        setTimeZone(payload.timeZone ?? "");
        setSavedKnowledge(`${payload.knowledgeBand ?? ""}:${payload.knowledgeGrade ?? ""}`);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(describeApiError(cause, t("profile.loadFailed"), t));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.status, t]);

  if (auth.status === "loading") {
    return <div role="status" className="mt-7 grid min-h-64 place-items-center rounded-[28px] border-2 border-ink/10 bg-white"><div className="text-center text-sm font-bold text-muted"><LoaderCircle className="mx-auto mb-3 animate-spin text-violet" />{t("profile.loading")}</div></div>;
  }
  if (auth.status === "guest") {
    return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-7 text-center"><GraduationCap className="mx-auto text-violet" size={38} /><h2 className="mt-4 font-display text-2xl font-black">{t("profile.guestTitle")}</h2><p className="mt-2 text-sm font-semibold text-muted">{t("profile.guestBody")}</p><Link href="/login?next=%2Fprofile" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white">{t("auth.loginSubmit")} <ArrowRight size={17} /></Link></section>;
  }
  if (loading) {
    return <div role="status" className="mt-7 grid min-h-64 place-items-center rounded-[28px] border-2 border-ink/10 bg-white"><div className="text-center text-sm font-bold text-muted"><LoaderCircle className="mx-auto mb-3 animate-spin text-violet" />{t("profile.loading")}</div></div>;
  }

  const selectedBand = profile?.gradeBands.find((band) => band.slug === knowledgeBand);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const payload = await apiRequest<ProfilePayload>("/api/learner/profile", {
        method: "PATCH",
        body: {
          displayName,
          knowledgeBand: knowledgeBand || null,
          knowledgeGrade: knowledgeGrade || null,
          ...(timeZone && timeZone !== profile?.timeZone ? { timeZone } : {}),
        },
      });
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
      setTimeZone(payload.timeZone ?? "");
      setSavedKnowledge(nextKnowledge);
      await auth.refresh();
      setMessage(t("profile.saved"));
    } catch (cause) {
      setError(describeApiError(cause, t("profile.saveFailed"), t));
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={saveProfile} className="mt-7 space-y-5">
    <section className="rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-7">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-peach"><UserRound size={20} /></span><div><h2 className="font-display text-xl font-black">{t("profile.nameTitle")}</h2><p className="mt-1 text-sm font-semibold text-muted">{t("profile.nameBody")}</p></div></div>
      <label className="mt-5 block text-sm font-black">{t("auth.nicknameOptional")}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} autoComplete="name" placeholder={t("auth.nicknamePlaceholder")} className="mt-2 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 px-4 text-sm font-semibold outline-none focus:border-violet focus:bg-white" /></label>
    </section>

    <section className="rounded-[28px] border-2 border-violet/20 bg-[#f0edff] p-6 sm:p-7">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-lime"><GraduationCap size={21} /></span><div><h2 className="font-display text-xl font-black">{t("profile.bandTitle")}</h2><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("profile.bandBody")}</p></div></div>
      <div role="group" aria-label={t("profile.bandGroup")} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" aria-pressed={!knowledgeBand} onClick={() => { setKnowledgeBand(""); setKnowledgeGrade(""); }} className={`min-h-11 rounded-xl border-2 px-3 text-sm font-black transition ${!knowledgeBand ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-muted hover:border-violet/40"}`}>{t("profile.anyBand")}</button>
        {profile?.gradeBands.map((band) => <button key={band.slug} type="button" aria-pressed={knowledgeBand === band.slug} onClick={() => { setKnowledgeBand(band.slug); setKnowledgeGrade(""); }} className={`min-h-11 rounded-xl border-2 px-3 text-sm font-black transition ${knowledgeBand === band.slug ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-muted hover:border-violet/40"}`}>{band.name}</button>)}
      </div>
      {selectedBand?.grades.length ? <div className="mt-5"><span className="mb-2 block text-sm font-black">{t("profile.gradeOptional")}</span><CustomSelect label={t("profile.gradeLabel")} value={knowledgeGrade} options={[{ value: "", label: t("profile.allGrades", { band: selectedBand.name }) }, ...selectedBand.grades.map((grade) => ({ value: grade.slug, label: grade.name }))]} onValueChange={setKnowledgeGrade} className="w-full" /></div> : null}
      <div className="mt-5 flex items-start gap-2 rounded-xl bg-white/70 px-4 py-3 text-xs font-semibold leading-5 text-muted"><Sparkles className="mt-0.5 shrink-0 text-violet" size={16} /><p>{t("profile.defaultsNote")}</p></div>
    </section>

    <section className="rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-7">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky"><Clock3 size={20} /></span><div><h2 className="font-display text-xl font-black">{t("profile.timeZoneTitle")}</h2><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("profile.timeZoneBody")}</p></div></div>
      <p className="mt-5 text-sm font-bold">{t("profile.timeZoneCurrent", { value: timeZone || t("profile.timeZoneUnset") })}</p>
      {deviceTimeZone && deviceTimeZone !== timeZone ? <button type="button" onClick={() => setTimeZone(deviceTimeZone)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink/10 bg-canvas px-4 text-sm font-black text-ink hover:border-violet/40">{t("profile.useDeviceTimeZone", { timeZone: deviceTimeZone })}</button> : null}
    </section>

    {message ? <p role="status" className="flex items-center gap-2 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]"><Check size={17} />{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-3"><button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-6 text-sm font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}{t("profile.save")}</button><Link href="/practice" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black text-violet hover:bg-white">{t("profile.goPractice")} <ArrowRight size={17} /></Link></div>
  </form>;
}
