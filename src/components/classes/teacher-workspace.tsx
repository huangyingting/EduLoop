"use client";

import { ArrowLeft, Archive, Copy, LoaderCircle, Plus, RefreshCw, Trash2, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import type { ClassroomDashboard, TeacherClassroomSummary } from "@/lib/contracts/classes";
import type { ContestListPayload } from "@/lib/contracts/contests";
import { ASSIGNMENT_KIND, type AssignmentKind } from "@/lib/domain-constants";
import { localizedDifficultyOptions } from "@/lib/question-labels";
import type { PracticeCatalog } from "../practice/practice-api";

const CONTEST_LEVELS = ["AMC-8", "AMC-10", "AMC-12"] as const;
const inputClass = "mt-1 min-h-10 w-full rounded-lg border-2 border-ink/10 bg-white px-3 text-sm font-semibold";

function AssignmentForm({ classroomId, onCreated }: { classroomId: string; onCreated: () => Promise<void> }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<AssignmentKind>(ASSIGNMENT_KIND.PRACTICE);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [goal, setGoal] = useState(10);
  const [level, setLevel] = useState<(typeof CONTEST_LEVELS)[number]>("AMC-8");
  const [paperKey, setPaperKey] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [catalog, setCatalog] = useState<PracticeCatalog | null>(null);
  const [papers, setPapers] = useState<ContestListPayload["papers"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<PracticeCatalog>("/api/catalog", { signal: controller.signal }).then(setCatalog).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (kind !== ASSIGNMENT_KIND.CONTEST) return;
    const controller = new AbortController();
    apiRequest<ContestListPayload>("/api/contests", { query: { level }, signal: controller.signal })
      .then((list) => setPapers(list.papers.filter(({ available }) => available)))
      .catch(() => setPapers([]));
    return () => controller.abort();
  }, [kind, level]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const due = dueAt ? new Date(dueAt).toISOString() : null;
    const body = kind === ASSIGNMENT_KIND.CONTEST
      ? { kind, title, paperKey, dueAt: due }
      : { kind, title, filters: { ...(subject ? { subject } : {}), ...(difficulty ? { difficulty } : {}) }, questionGoal: goal, dueAt: due };
    try {
      await apiRequest(`/api/classes/${classroomId}/assignments`, { method: "POST", body });
      setTitle(""); setPaperKey(""); setDueAt("");
      await onCreated();
    } catch (cause) {
      setError(describeApiError(cause, t("teach.assignFailed"), t));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border-2 border-dashed border-ink/15 bg-white p-4 sm:grid-cols-2">
    <h3 className="font-black sm:col-span-2">{t("teach.assignTitle")}</h3>
    <label className="text-xs font-black">{t("teach.assignmentTitle")}<input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></label>
    <label className="text-xs font-black">{t("teach.kind")}<select value={kind} onChange={(event) => setKind(event.target.value as AssignmentKind)} className={inputClass}><option value={ASSIGNMENT_KIND.PRACTICE}>{t("teach.practiceKind")}</option><option value={ASSIGNMENT_KIND.CONTEST}>{t("teach.contestKind")}</option></select></label>
    {kind === ASSIGNMENT_KIND.PRACTICE ? <>
      <label className="text-xs font-black">{t("teach.subject")}<select value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass}><option value="">{t("teach.anySubject")}</option>{catalog?.subjects.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="text-xs font-black">{t("teach.difficulty")}<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className={inputClass}><option value="">{t("teach.anyDifficulty")}</option>{localizedDifficultyOptions(t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="text-xs font-black">{t("teach.goal")}<input type="number" min={1} max={50} value={goal} onChange={(event) => setGoal(Number(event.target.value))} className={inputClass} /></label>
    </> : <>
      <label className="text-xs font-black">{t("teach.level")}<select value={level} onChange={(event) => { setLevel(event.target.value as (typeof CONTEST_LEVELS)[number]); setPaperKey(""); }} className={inputClass}>{CONTEST_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-xs font-black">{t("teach.paper")}<select required value={paperKey} onChange={(event) => setPaperKey(event.target.value)} className={inputClass}><option value="">{t("teach.choosePaper")}</option>{papers.map((paper) => <option key={paper.key} value={paper.key}>{paper.year} {paper.contest}</option>)}</select></label>
    </>}
    <label className="text-xs font-black">{t("teach.dueAt")}<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={inputClass} /></label>
    <div className="flex items-end sm:col-span-2"><button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}{t("teach.assign")}</button></div>
    {error ? <p role="alert" className="text-sm font-bold text-coral sm:col-span-2">{error}</p> : null}
  </form>;
}

function Dashboard({ classroomId, onBack }: { classroomId: string; onBack: () => void }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<ClassroomDashboard | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<ClassroomDashboard>(`/api/classes/${classroomId}`, { onUnauthorized: "redirect" }));
    } catch (cause) {
      setError(describeApiError(cause, t("teach.loadFailed"), t));
    }
  }, [classroomId, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(request: () => Promise<unknown>) {
    setError("");
    try {
      await request();
      await load();
    } catch (cause) {
      setError(describeApiError(cause, t("teach.actionFailed"), t));
    }
  }

  if (!data) return error ? <p role="alert" className="mt-6 text-sm font-bold text-coral">{error}</p> : <div role="status" className="mt-10 grid place-items-center"><LoaderCircle className="animate-spin text-violet" /></div>;
  return <section aria-labelledby="class-dashboard-title" className="mt-6">
    <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 text-sm font-black text-violet"><ArrowLeft size={16} /> {t("teach.back")}</button>
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[24px] border-2 border-ink/10 bg-white p-5">
      <div className="min-w-0 flex-1"><h2 id="class-dashboard-title" className="font-display text-2xl font-black">{data.name}</h2><p className="text-xs font-bold text-muted">{t("teach.members", { count: data.memberCount })}{data.archived ? ` · ${t("teach.archived")}` : ""}</p></div>
      <div className="rounded-xl bg-lime px-4 py-2 text-center"><p className="text-[11px] font-black uppercase">{t("teach.joinCode")}</p><p className="font-mono text-lg font-black tracking-[.2em]">{data.joinCode}</p></div>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(data.joinCode)} aria-label={t("teach.copyCode")} className="grid size-10 place-items-center rounded-xl border-2 border-ink/10"><Copy size={16} /></button>
      <button type="button" onClick={() => void act(() => apiRequest(`/api/classes/${data.id}`, { method: "PATCH", body: { rotateJoinCode: true } }))} className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-ink/10 px-3 text-xs font-black"><RefreshCw size={14} /> {t("teach.rotate")}</button>
      <button type="button" onClick={() => void act(() => apiRequest(`/api/classes/${data.id}`, { method: "PATCH", body: { archived: !data.archived } }))} className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-ink/10 px-3 text-xs font-black"><Archive size={14} /> {data.archived ? t("teach.unarchive") : t("teach.archive")}</button>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}

    <AssignmentForm classroomId={data.id} onCreated={load} />

    <h3 className="mt-6 font-display text-lg font-black">{t("teach.assignmentsTitle")}</h3>
    {data.assignments.length ? <ul className="mt-3 space-y-2">{data.assignments.map((assignment) => <li key={assignment.id} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-ink/10 bg-white px-4 py-3 text-sm">
      <span className="font-black">{assignment.title}</span>
      <span className="text-xs font-bold text-muted">{assignment.kind === ASSIGNMENT_KIND.CONTEST ? t("teach.contestKind") : t("teach.goalSummary", { count: assignment.questionGoal })}{assignment.dueAt ? ` · ${new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(assignment.dueAt))}` : ""}</span>
      <span className="text-xs font-bold text-violet">{t("teach.completed", { count: assignment.completedCount, total: data.members.length })}</span>
      <button type="button" onClick={() => { if (window.confirm(t("teach.confirmDeleteAssignment", { title: assignment.title }))) void act(() => apiRequest(`/api/classes/${data.id}/assignments`, { method: "DELETE", body: { assignmentId: assignment.id } })); }} className="ml-auto inline-flex items-center gap-1 text-xs font-black text-muted hover:text-coral"><Trash2 size={13} /> {t("teach.deleteAssignment")}</button>
    </li>)}</ul> : <p className="mt-2 text-sm font-semibold text-muted">{t("teach.noAssignments")}</p>}

    <h3 className="mt-6 font-display text-lg font-black">{t("teach.progressTitle")}</h3>
    {data.members.length ? <div className="mt-3 overflow-x-auto rounded-2xl border-2 border-ink/10 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead><tr className="border-b border-ink/10 text-xs font-black text-muted"><th scope="col" className="px-4 py-3">{t("teach.student")}</th>{data.assignments.map((assignment) => <th key={assignment.id} scope="col" className="px-3 py-3">{assignment.title}</th>)}<th scope="col" className="px-3 py-3" /></tr></thead>
        <tbody>{data.members.map((member) => <tr key={member.learnerId} className="border-b border-ink/5">
          <th scope="row" className="px-4 py-3 font-black">{member.displayName || t("teach.unnamed")}</th>
          {data.assignments.map((assignment) => {
            const progress = member.progress[assignment.id];
            return <td key={assignment.id} className={`px-3 py-3 font-bold ${progress?.completed ? "text-[#247a59]" : "text-muted"}`}>{progress ? `${progress.progress} / ${progress.target}${progress.bestScore !== null ? ` · ${progress.bestScore}` : ""}` : "—"}</td>;
          })}
          <td className="px-3 py-3"><button type="button" onClick={() => { if (window.confirm(t("teach.confirmRemove", { name: member.displayName || t("teach.unnamed") }))) void act(() => apiRequest(`/api/classes/${data.id}/members`, { method: "DELETE", body: { learnerId: member.learnerId } })); }} className="inline-flex items-center gap-1 text-xs font-black text-muted hover:text-coral"><UserMinus size={14} /> {t("teach.remove")}</button></td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="mt-2 text-sm font-semibold text-muted">{t("teach.noMembers")}</p>}

    <h3 className="mt-6 font-display text-lg font-black">{t("teach.topicsTitle")}</h3>
    <p className="text-xs font-semibold text-muted">{t("teach.topicsNote")}</p>
    {data.topics.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.topics.map((topic) => <li key={topic.label} className="rounded-xl border-2 border-ink/10 p-3" style={{ background: `hsl(${Math.round(topic.accuracy * 1.2)} 70% 94%)` }}><p className="font-black">{topic.label}</p><p className="text-xs font-bold text-muted">{t("teach.topicStats", { accuracy: topic.accuracy, count: topic.attempts })}</p></li>)}</ul> : <p className="mt-2 text-sm font-semibold text-muted">{t("teach.topicsEmpty")}</p>}
  </section>;
}

export function TeacherWorkspace() {
  const { t } = useI18n();
  const [classes, setClasses] = useState<TeacherClassroomSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await apiRequest<{ teaching: TeacherClassroomSummary[] | null }>("/api/classes", { onUnauthorized: "redirect" });
      if (payload.teaching === null) setForbidden(true);
      else setClasses(payload.teaching);
    } catch (cause) {
      setError(describeApiError(cause, t("teach.loadFailed"), t));
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const created = await apiRequest<TeacherClassroomSummary>("/api/classes", { method: "POST", body: { name } });
      setName("");
      await load();
      setSelected(created.id);
    } catch (cause) {
      setError(describeApiError(cause, t("teach.createFailed"), t));
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-8 sm:px-8 lg:px-10">
    <header><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Classroom</p><h1 className="mt-1 font-display text-3xl font-black tracking-[-.04em]">{t("teach.title")}</h1><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("teach.lead")}</p></header>
    {forbidden ? <p role="alert" className="mt-6 rounded-2xl border-2 border-violet/20 bg-[#f0edff] p-5 text-sm font-bold text-violet">{t("errors.notTeacher")}</p> : selected ? <Dashboard classroomId={selected} onBack={() => { setSelected(null); void load(); }} /> : <>
      <form onSubmit={create} className="mt-6 flex flex-wrap items-end gap-3 rounded-[24px] border-2 border-ink/10 bg-white p-5">
        <label className="min-w-[240px] flex-1 text-sm font-black">{t("teach.nameLabel")}<input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("teach.namePlaceholder")} className={inputClass} /></label>
        <button disabled={busy || !name.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}{t("teach.create")}</button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
      {classes === null && !error ? <div role="status" className="mt-10 grid place-items-center"><LoaderCircle className="animate-spin text-violet" /></div> : null}
      {classes && !classes.length ? <p className="mt-6 text-sm font-semibold text-muted">{t("teach.empty")}</p> : null}
      {classes?.length ? <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{classes.map((classroom) => <li key={classroom.id} className={`rounded-2xl border-2 p-4 ${classroom.archived ? "border-ink/5 bg-canvas opacity-70" : "border-ink/10 bg-white"}`}>
        <p className="font-display text-lg font-black">{classroom.name}</p>
        <p className="mt-1 text-xs font-bold text-muted">{t("teach.members", { count: classroom.memberCount })} · {t("teach.assignmentsCount", { count: classroom.assignmentCount })}{classroom.archived ? ` · ${t("teach.archived")}` : ""}</p>
        <p className="mt-2 font-mono text-sm font-black tracking-[.2em]">{classroom.joinCode}</p>
        <button type="button" onClick={() => setSelected(classroom.id)} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-ink px-4 text-sm font-black text-white">{t("teach.open")}</button>
      </li>)}</ul> : null}
    </>}
  </div>;
}
