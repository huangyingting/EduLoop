"use client";

import { ArrowRight, CheckCircle2, LoaderCircle, LogOut, School } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { Translator } from "@/i18n/messages";
import { apiRequest, describeApiError } from "@/lib/api-client";
import type { LearnerAssignmentView, LearnerClassroomsPayload } from "@/lib/contracts/classes";
import { ASSIGNMENT_KIND } from "@/lib/domain-constants";

function dueLabel(t: Translator, locale: string, dueAt: string | null) {
  if (!dueAt) return t("classes.noDue");
  return t("classes.due", { date: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(dueAt)) });
}

function AssignmentRow({ assignment }: { assignment: LearnerAssignmentView }) {
  const { locale, t } = useI18n();
  const percent = Math.round((assignment.progress / Math.max(assignment.target, 1)) * 100);
  return <li className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink/10 bg-white p-4">
    <div className="min-w-0 flex-1">
      <p className="text-xs font-black uppercase tracking-[.14em] text-violet">{assignment.kind === ASSIGNMENT_KIND.CONTEST ? t("classes.contestKind") : t("classes.practiceKind")}</p>
      <p className="mt-1 font-black">{assignment.title}</p>
      <p className="mt-1 text-xs font-bold text-muted">{dueLabel(t, locale, assignment.dueAt)}{assignment.bestScore !== null ? ` · ${t("classes.bestScore", { score: assignment.bestScore })}` : ""}</p>
      <div role="progressbar" aria-label={assignment.title} aria-valuemin={0} aria-valuemax={assignment.target} aria-valuenow={assignment.progress} className="mt-2 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-violet" style={{ width: `${percent}%` }} /></div>
    </div>
    {assignment.completed
      ? <span className="flex items-center gap-1 text-sm font-black text-[#247a59]"><CheckCircle2 size={17} /> {t("classes.done")}</span>
      : <span className="text-sm font-black text-muted">{t("classes.progress", { progress: assignment.progress, target: assignment.target })}</span>}
    <Link href={assignment.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white">{t("classes.start")} <ArrowRight size={16} /></Link>
  </li>;
}

export function LearnerClasses() {
  const { t } = useI18n();
  const [data, setData] = useState<LearnerClassroomsPayload | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<LearnerClassroomsPayload>("/api/classes", { onUnauthorized: "redirect" }));
    } catch (cause) {
      setError(describeApiError(cause, t("classes.loadFailed"), t));
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy("join"); setError(""); setMessage("");
    try {
      const joined = await apiRequest<{ id: string; name: string }>("/api/classes/join", { method: "POST", body: { code } });
      setCode("");
      setMessage(t("classes.joined", { name: joined.name }));
      await load();
    } catch (cause) {
      setError(describeApiError(cause, t("classes.joinFailed"), t));
    } finally {
      setBusy("");
    }
  }

  async function leave(classroomId: string, name: string) {
    if (!window.confirm(t("classes.confirmLeave", { name }))) return;
    setBusy(classroomId); setError(""); setMessage("");
    try {
      await apiRequest("/api/classes/join", { method: "DELETE", body: { classroomId } });
      await load();
    } catch (cause) {
      setError(describeApiError(cause, t("classes.leaveFailed"), t));
    } finally {
      setBusy("");
    }
  }

  return <div className="mx-auto max-w-[960px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
    <header className="rounded-[30px] border-2 border-ink bg-sky p-6 shadow-[0_7px_0_#242136] sm:p-8">
      <div className="flex items-center gap-3"><School size={32} /><h1 className="font-display text-3xl font-black tracking-[-.04em]">{t("classes.title")}</h1></div>
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-ink/75">{t("classes.lead")}</p>
    </header>

    <form onSubmit={join} className="mt-6 rounded-[24px] border-2 border-ink/10 bg-white p-5">
      <label className="block text-sm font-black">{t("classes.codeLabel")}
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={8} autoComplete="off" placeholder={t("classes.codePlaceholder")} className="mt-2 min-h-11 w-full rounded-xl border-2 border-ink/10 px-3 font-mono text-base tracking-[.2em] uppercase" />
      </label>
      <p className="mt-2 text-xs font-semibold leading-5 text-muted">{t("classes.privacy")}</p>
      <button disabled={code.length !== 8 || Boolean(busy)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{busy === "join" ? <LoaderCircle className="animate-spin" size={16} /> : null}{t("classes.join")}</button>
      {message ? <p role="status" className="mt-3 text-sm font-bold text-[#247a59]">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
    </form>

    {!data && !error ? <div role="status" className="mt-10 grid place-items-center"><LoaderCircle className="animate-spin text-violet" /></div> : null}
    {data && !data.classrooms.length ? <p className="mt-6 text-sm font-semibold text-muted">{t("classes.empty")}</p> : null}
    {data?.classrooms.map((classroom) => <section key={classroom.id} aria-labelledby={`class-${classroom.id}`} className="mt-6 rounded-[26px] border-2 border-ink/10 bg-canvas p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h2 id={`class-${classroom.id}`} className="font-display text-xl font-black">{classroom.name}</h2>{classroom.teacherName ? <p className="text-xs font-bold text-muted">{t("classes.teacher", { name: classroom.teacherName })}</p> : null}</div>
        <button type="button" onClick={() => void leave(classroom.id, classroom.name)} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-muted hover:text-coral"><LogOut size={15} /> {t("classes.leave")}</button>
      </div>
      {classroom.assignments.length
        ? <ul className="mt-4 space-y-3">{classroom.assignments.map((assignment) => <AssignmentRow key={assignment.id} assignment={assignment} />)}</ul>
        : <p className="mt-3 text-sm font-semibold text-muted">{t("classes.noAssignments")}</p>}
    </section>)}
  </div>;
}
