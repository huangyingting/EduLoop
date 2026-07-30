"use client";

import { Bookmark, BookmarkCheck, Check, ChevronDown, ChevronRight, CircleAlert, Flag, Flame, Keyboard, Lightbulb, ListFilter, LoaderCircle, RotateCcw, Send, Sparkles, Trophy, WandSparkles, X } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPracticePreferences, getTimeZone, savePracticePreferences } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";
import { ignoresPracticeShortcuts, optionIndexForShortcut } from "@/lib/practice-shortcuts";
import { CustomSelect } from "./custom-select";
import { useLearner } from "./learner-provider";
import { MathText } from "./math-text";

type Question = {
  id: string; stem: string; type: string; typeLabel: string; difficulty: string; isAutoGradable: boolean; hasHint: boolean;
  subject: { name: string; slug: string; color: string }; grade: string;
  stemAsset: { path: string; altText: string } | null;
  options: Array<{ label: string; content: string; asset: { path: string; altText: string } | null }>;
  tags: Array<{ dimension: string; slug: string; label: string }>;
  isSaved: boolean; recommendationReason: string | null;
};
type Result = { attemptId: string | null; isCorrect: boolean | null; correctLabels: string[]; answer: string; explanation: string | null; earnedXp: number; totalXp: number; level: number; currentStreak: number; streakFreezes: number; streakFreezeUsed: boolean; todayAttempts: number; newBadges: Array<{ name: string; icon: string }>; session: { status: string; completedCount: number; questionGoal: number; correctCount: number; earnedXp: number } | null; replayed: boolean; persisted: boolean };
type PracticeFilters = { subject: string; gradeBand: string; grade: string; difficulty: string; type: string; tags: string };
type PracticeCatalog = {
  subjects: Array<{ slug: string; name: string }>;
  gradeBands: Array<{ slug: string; name: string }>;
  grades: Array<{ slug: string; name: string }>;
  tagDimensions: Array<{ key: string; label: string; tags: Array<{ slug: string; label: string }> }>;
};
type SessionSnapshot = {
  id: string; status: string; questionGoal: number; completedCount: number; correctCount: number;
  earnedXp: number; recentQuestionIds: string[]; resumed: boolean;
};

const typeNames: Record<string, string> = { SINGLE_CHOICE: "单项选择", MULTIPLE_CHOICE: "多项选择", TRUE_FALSE: "判断", FILL_BLANK: "填空", COMPUTATION: "计算", EXPERIMENT: "实验探究", WRITTEN_RESPONSE: "解答" };
const difficultyOptions = [
  { value: "", label: "全部难度" },
  { value: "EASY", label: "热身" },
  { value: "MEDIUM", label: "进阶" },
  { value: "HARD", label: "挑战" },
];
const typeOptions = [
  { value: "", label: "全部题型" },
  ...Object.entries(typeNames).map(([value, label]) => ({ value, label })),
];
const reportCategoryOptions = [
  { value: "WRONG_ANSWER", label: "答案或解析有误" },
  { value: "MISSING_FIGURE", label: "缺少图片或图表" },
  { value: "UNCLEAR", label: "题意不清楚" },
  { value: "FORMATTING", label: "公式或排版问题" },
  { value: "OTHER", label: "其他问题" },
];

function tagFilterEntries(value: string) {
  return value.split(",").filter(Boolean).map((entry) => {
    const separator = entry.indexOf(":");
    return separator === -1
      ? { dimension: "TOPIC", slug: entry }
      : { dimension: entry.slice(0, separator), slug: entry.slice(separator + 1) };
  });
}

function selectedTagFilter(value: string, dimension: string) {
  return tagFilterEntries(value).find((entry) => entry.dimension === dimension)?.slug ?? "";
}

function replaceTagFilter(value: string, dimension: string, slug: string) {
  const retained = tagFilterEntries(value).filter((entry) => entry.dimension !== dimension);
  if (slug) retained.push({ dimension, slug });
  return retained.map((entry) => `${entry.dimension}:${entry.slug}`).join(",");
}

export function PracticePlayer() {
  const search = useSearchParams();
  const auth = useAuth();
  const requestedPracticeMode = search.get("mode") === "review" ? "review" : search.get("mode") === "adaptive" ? "adaptive" : "standard";
  const practiceMode = auth.status === "authenticated" ? requestedPracticeMode : "standard";
  const isAuthenticated = auth.status === "authenticated";
  const { stats, applyAttempt } = useLearner();
  const [filters, setFilters] = useState<PracticeFilters>(() => {
    const subject = search.get("subject") ?? "";
    const gradeBand = search.get("gradeBand") ?? "";
    return {
      subject,
      gradeBand,
      grade: gradeBand ? search.get("grade") ?? "" : "",
      difficulty: search.get("difficulty") ?? "",
      type: search.get("type") ?? "",
      tags: search.get("tags") ?? "",
    };
  });
  const [catalog, setCatalog] = useState<PracticeCatalog>({ subjects: [], gradeBands: [], grades: [], tagDimensions: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [written, setWritten] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [combo, setCombo] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("UNCLEAR");
  const [reportDetail, setReportDetail] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState("");
  const startedAt = useRef(0);
  const sessionId = useRef<string | null>(null);
  const sessionRequest = useRef<Promise<SessionSnapshot | null>>(Promise.resolve(null));
  const targetedQuestionId = useRef(search.get("questionId") ?? "");
  const questionRequest = useRef<AbortController | null>(null);
  const hintRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const clientAttemptId = useRef("");
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const explanationDetails = useRef<HTMLDetailsElement>(null);
  const viewedExplanations = useRef(new Set<string>());
  const initialized = useRef(false);

  const resolveInitialFilters = useCallback((): PracticeFilters => {
    const next = isAuthenticated ? { ...getPracticePreferences() } : { subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "" };
    const keys: Array<keyof PracticeFilters> = ["subject", "gradeBand", "grade", "difficulty", "type", "tags"];
    for (const key of keys) {
      if (search.has(key)) next[key] = search.get(key) ?? "";
    }
    if (search.has("gradeBand") && !search.has("grade")) next.grade = "";
    if (search.has("subject") && !search.has("tags")) next.tags = "";
    if (!next.gradeBand) next.grade = "";
    return next;
  }, [isAuthenticated, search]);

  const startSession = useCallback((nextFilters: typeof filters, restart = false) => {
    if (!isAuthenticated) {
      sessionId.current = null;
      return Promise.resolve(null);
    }
    const pending = sessionRequest.current.catch(() => null).then(async () => {
      try {
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionGoal: 10, filters: { ...nextFilters, mode: practiceMode }, restart }),
        });
        if (response.ok) {
          const session = await response.json() as SessionSnapshot;
          sessionId.current = session.id;
          return session;
        }
      } catch {
        // A later queued request can still recover the active session.
      }
      sessionId.current = null;
      return null;
    });
    sessionRequest.current = pending;
    return pending;
  }, [isAuthenticated, practiceMode]);

  const loadQuestion = useCallback(async (nextFilters = filters, excluded = recent, requestedQuestionId = targetedQuestionId.current) => {
    const generation = ++requestGeneration.current;
    questionRequest.current?.abort();
    hintRequest.current?.abort();
    const controller = new AbortController();
    questionRequest.current = controller;
    setLoading(true); setQuestion(null); setError(""); setResult(null); setSelected([]); setWritten(""); setReportOpen(false); setReported(false); setReportDetail(""); setHint(null); setHintLoading(false); setHintError("");
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => value && params.set(key, value));
    if (requestedQuestionId) params.set("questionId", requestedQuestionId);
    if (practiceMode !== "standard") params.set("mode", practiceMode);
    if (excluded.length) params.set("exclude", excluded.join(","));
    try {
      const response = await fetch(`/api/questions/next?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 404 ? "这个组合暂时没有可用题目，换个筛选试试吧。" : "题目加载失败，请稍后再试。");
      const payload = await response.json() as Question;
      if (generation !== requestGeneration.current) return;
      if (targetedQuestionId.current === requestedQuestionId) targetedQuestionId.current = "";
      setQuestion(payload); setRecent((items) => [...items.slice(-7), payload.id]); clientAttemptId.current = crypto.randomUUID(); startedAt.current = Date.now();
    } catch (cause) {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setError(cause instanceof Error ? cause.message : "加载失败");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [filters, practiceMode, recent]);

  useEffect(() => {
    if (auth.status === "loading" || initialized.current) return;
    initialized.current = true;
    const timer = window.setTimeout(() => void (async () => {
      const initialFilters = resolveInitialFilters();
      setFilters(initialFilters);
      if (isAuthenticated) savePracticePreferences(initialFilters);
      const session = await startSession(initialFilters);
      const exclusions = session?.recentQuestionIds.slice(0, 20) ?? [];
      if (session?.resumed) {
        setCompleted(session.completedCount);
        setCorrect(session.correctCount);
        setRecent(exclusions.slice(-8));
      }
      await loadQuestion(initialFilters, exclusions);
    })(), 0);
    return () => { window.clearTimeout(timer); questionRequest.current?.abort(); hintRequest.current?.abort(); };
    // Initialization waits for Auth.js once, then the player owns its in-memory state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.subject) params.set("subject", filters.subject);
    if (filters.gradeBand) params.set("gradeBand", filters.gradeBand);
    if (filters.grade) params.set("grade", filters.grade);
    fetch(`/api/catalog?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("筛选项加载失败");
        return response.json() as Promise<PracticeCatalog>;
      })
      .then((payload) => setCatalog(payload))
      .catch((cause) => { if (!controller.signal.aborted) setCatalogError(cause instanceof Error ? cause.message : "筛选项加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => { controller.abort(); };
  }, [filters.grade, filters.gradeBand, filters.subject]);

  useEffect(() => {
    if (question?.id) questionHeading.current?.focus();
  }, [question?.id]);

  useEffect(() => {
    if (result) resultPanel.current?.focus();
  }, [result]);

  function changeFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value };
    if (key === "gradeBand") {
      next.grade = "";
      next.subject = "";
      next.tags = "";
    } else if (key === "grade") {
      next.subject = "";
      next.tags = "";
    } else if (key === "subject") {
      next.tags = "";
    }
    if (key === "gradeBand" || key === "grade" || key === "subject") {
      setCatalogLoading(true);
      setCatalogError("");
    }
    setFilters(next); if (isAuthenticated) savePracticePreferences(next); setRecent([]); setCompleted(0); setCorrect(0); setCombo(0);
    void (async () => { const session = await startSession(next); await loadQuestion(next, session?.recentQuestionIds ?? []); })();
  }

  function resetFilters() {
    const next: PracticeFilters = { subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "" };
    setFilters(next);
    if (isAuthenticated) savePracticePreferences(next);
    setRecent([]);
    setCompleted(0);
    setCorrect(0);
    setCombo(0);
    setCatalogLoading(true);
    setCatalogError("");
    setAdvancedFiltersOpen(false);
    void (async () => { const session = await startSession(next); await loadQuestion(next, session?.recentQuestionIds ?? []); })();
  }

  async function revealHint() {
    if (!question?.hasHint || result || hint || hintLoading) return;
    hintRequest.current?.abort();
    const controller = new AbortController();
    hintRequest.current = controller;
    setHintLoading(true); setHintError("");
    const params = new URLSearchParams({ questionId: question.id });
    try {
      const response = await fetch(`/api/questions/hint?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error("提示加载失败，请稍后再试。");
      const payload = await response.json() as { hint: string | null };
      if (!payload.hint) throw new Error("这道题暂时没有可用提示。");
      setHint(payload.hint);
    } catch (cause) {
      if (!controller.signal.aborted) setHintError(cause instanceof Error ? cause.message : "提示加载失败");
    } finally {
      if (hintRequest.current === controller) setHintLoading(false);
    }
  }

  function toggleOption(label: string) {
    if (!question || result || loading) return;
    if (question.type === "MULTIPLE_CHOICE") setSelected((items) => items.includes(label) ? items.filter((item) => item !== label) : [...items, label]);
    else setSelected([label]);
  }

  async function submit() {
    if (!question || result || loading || (question.options.length ? !selected.length : !written.trim())) return;
    setLoading(true);
    try {
      const response = await fetch("/api/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        questionId: question.id,
        response: question.options.length ? selected : written.trim(),
        ...(isAuthenticated ? { timeZone: getTimeZone(), sessionId: sessionId.current ?? undefined, clientAttemptId: clientAttemptId.current, secondsSpent: Math.round((Date.now() - startedAt.current) / 1000) } : {}),
      }) });
      if (!response.ok) throw new Error("答案提交失败，请再试一次。");
      const payload = await response.json() as Result; setResult(payload); setCompleted((value) => value + 1); if (isAuthenticated) applyAttempt(payload);
      if (payload.isCorrect) { setCorrect((value) => value + 1); setCombo((value) => value + 1); } else if (payload.isCorrect === false) setCombo(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setLoading(false); }
  }

  async function selfAssess(isCorrect: boolean) {
    if (!result || result.isCorrect !== null || assessing) return;
    setAssessing(true); setError("");
    if (!isAuthenticated || !result.attemptId) {
      setResult((current) => current ? { ...current, isCorrect } : current);
      if (isCorrect) { setCorrect((value) => value + 1); setCombo((value) => value + 1); } else setCombo(0);
      setAssessing(false);
      return;
    }
    try {
      const response = await fetch("/api/attempts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: result.attemptId, timeZone: getTimeZone(), isCorrect }),
      });
      if (!response.ok) throw new Error("自评保存失败，请再试一次。");
      setResult((current) => current ? { ...current, isCorrect } : current);
      if (!isCorrect && explanationDetails.current?.open) void recordExplanationView({ ...result, isCorrect: false });
      if (isCorrect) { setCorrect((value) => value + 1); setCombo((value) => value + 1); } else setCombo(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "自评保存失败"); }
    finally { setAssessing(false); }
  }

  async function recordExplanationView(attempt = result) {
    if (!isAuthenticated || !attempt?.attemptId || attempt.isCorrect !== false || !attempt.explanation || viewedExplanations.current.has(attempt.attemptId)) return;
    viewedExplanations.current.add(attempt.attemptId);
    try {
      const response = await fetch("/api/attempts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "EXPLANATION_VIEWED", attemptId: attempt.attemptId }),
      });
      if (!response.ok) viewedExplanations.current.delete(attempt.attemptId);
    } catch {
      viewedExplanations.current.delete(attempt.attemptId);
    }
  }

  async function toggleSaved() {
    if (!question || saving) return;
    const nextSaved = !question.isSaved;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, saved: nextSaved }),
      });
      if (!response.ok) throw new Error("收藏状态保存失败，请再试一次。");
      setQuestion((current) => current ? { ...current, isSaved: nextSaved } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "收藏失败"); }
    finally { setSaving(false); }
  }

  async function reportQuestion() {
    if (!question || reporting || reported) return;
    setReporting(true); setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, category: reportCategory, detail: reportDetail.trim() || undefined }),
      });
      if (!response.ok) throw new Error("问题反馈提交失败，请稍后再试。");
      setReported(true); setReportOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "反馈失败"); }
    finally { setReporting(false); }
  }

  async function nextQuestion() {
    if (loading || assessing) return;
    if (completed >= 10) {
      setCompleted(0); setCorrect(0); setCombo(0); setRecent([]);
      await startSession(filters);
      await loadQuestion(filters, []);
      return;
    }
    await loadQuestion();
  }

  async function restartChallenge() {
    if (loading || (completed > 0 && !window.confirm(isAuthenticated ? "重新开始本轮挑战吗？已完成的答题记录会保留。" : "重新开始本轮挑战吗？访客练习本来就不会保存记录。"))) return;
    setCompleted(0); setCorrect(0); setCombo(0); setRecent([]);
    const session = await startSession(filters, true);
    await loadQuestion(filters, session?.recentQuestionIds ?? []);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!question || loading || event.repeat || ignoresPracticeShortcuts(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      const optionIndex = optionIndexForShortcut(event.key, question.options.length);
      if (optionIndex !== null && !result) {
        event.preventDefault();
        toggleOption(question.options[optionIndex].label);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (result && result.isCorrect !== null && !assessing) void nextQuestion();
        else if (!result) void submit();
      } else if (event.key.toLowerCase() === "h" && !result && question.hasHint) {
        event.preventDefault();
        void revealHint();
      } else if (event.key.toLowerCase() === "s" && isAuthenticated) {
        event.preventDefault();
        void toggleSaved();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Shortcut actions intentionally use the latest render state.
  });

  const answerable = question?.options.length ? selected.length > 0 : written.trim().length > 0;
  const topicTags = question?.tags.filter((tag) => tag.dimension === "TOPIC").slice(0, 2) ?? [];
  const hasOptionAssets = question?.options.some((option) => option.asset) ?? false;
  const tagFilterCount = tagFilterEntries(filters.tags).length;
  const activeFilterCount = [filters.gradeBand, filters.grade, filters.subject, filters.difficulty, filters.type]
    .filter(Boolean).length + tagFilterCount;
  const activeAdvancedFilterCount = [filters.difficulty, filters.type].filter(Boolean).length + tagFilterCount;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-violet">{practiceMode === "review" ? "Review mode" : practiceMode === "adaptive" ? "Adaptive mode" : "Focus mode"}</p><h1 className="mt-1 font-display text-3xl font-black tracking-[-.04em]">{practiceMode === "review" ? "错题复习" : practiceMode === "adaptive" ? "智能练习" : "专注练习"}</h1></div>
        {isAuthenticated ? <div className="flex gap-2">
          <div className="rounded-2xl border-2 border-ink/10 bg-white px-4 py-2 text-sm font-black shadow-[0_4px_0_#e3dfd4]"><Flame className="mr-1.5 inline text-coral" size={17} />{combo} 连胜</div>
          <div className="rounded-2xl bg-ink px-4 py-2 text-sm font-black text-white"><Sparkles className="mr-1.5 inline text-lime" size={17} />{stats.xp} XP</div>
        </div> : <div className="rounded-2xl border-2 border-violet/15 bg-[#f0edff] px-4 py-2 text-xs font-bold text-violet">访客模式 · 本轮仅保存在内存中</div>}
      </header>

      <section aria-labelledby="practice-filter-heading" className="mt-6 rounded-2xl border-2 border-ink/10 bg-white/70 p-3 shadow-[0_3px_0_rgba(36,33,54,.06)] sm:p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#efecff] text-violet"><ListFilter size={17} strokeWidth={2.5} /></span>
            <div className="min-w-0">
              <h2 id="practice-filter-heading" className="text-sm font-black">选择练习范围</h2>
              <p className="truncate text-[11px] font-bold text-muted">{activeFilterCount ? `已启用 ${activeFilterCount} 个条件` : "默认从全部题目中选择"}</p>
            </div>
          </div>
          {activeFilterCount ? <button type="button" onClick={resetFilters} disabled={loading} className="shrink-0 rounded-lg px-2 py-2 text-xs font-black text-muted transition hover:bg-white hover:text-violet disabled:opacity-40"><RotateCcw className="mr-1 inline" size={13} />重置</button> : null}
        </div>

        <div role="group" aria-label="基础筛选" className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
          <CustomSelect
            label="选择学段"
            value={filters.gradeBand}
            options={[{ value: "", label: "全部学段" }, ...catalog.gradeBands.map((item) => ({ value: item.slug, label: item.name }))]}
            onValueChange={(value) => changeFilter("gradeBand", value)}
            disabled={loading || catalogLoading}
            className="w-full"
          />
          {filters.gradeBand ? <CustomSelect
            label="选择年级"
            value={filters.grade}
            options={[{ value: "", label: "全部年级" }, ...catalog.grades.map((item) => ({ value: item.slug, label: item.name }))]}
            onValueChange={(value) => changeFilter("grade", value)}
            disabled={loading || catalogLoading}
            className="w-full"
          /> : null}
          <CustomSelect
            label="选择学科"
            value={filters.subject}
            options={[{ value: "", label: "全部学科" }, ...catalog.subjects.map((item) => ({ value: item.slug, label: item.name }))]}
            onValueChange={(value) => changeFilter("subject", value)}
            disabled={loading || catalogLoading}
            className={`w-full ${filters.gradeBand ? "col-span-2 sm:col-span-1" : ""}`}
          />
        </div>

        <button
          type="button"
          aria-expanded={advancedFiltersOpen}
          aria-controls="advanced-practice-filters"
          onClick={() => setAdvancedFiltersOpen((open) => !open)}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black text-muted transition hover:bg-white hover:text-violet lg:hidden"
        >
          {advancedFiltersOpen ? "收起更多筛选" : "更多筛选"}
          {activeAdvancedFilterCount ? <span className="grid min-w-5 place-items-center rounded-full bg-violet px-1.5 py-0.5 text-[10px] text-white">{activeAdvancedFilterCount}</span> : null}
          <ChevronDown className={`transition-transform ${advancedFiltersOpen ? "rotate-180" : ""}`} size={15} />
        </button>

        <div id="advanced-practice-filters" role="group" aria-label="更多筛选" className={`${advancedFiltersOpen ? "grid" : "hidden"} mt-2 min-w-0 grid-cols-2 gap-2 border-t border-dashed border-ink/10 pt-3 sm:grid-cols-3 lg:grid lg:grid-cols-5`}>
          {catalog.tagDimensions.map((dimension) => <CustomSelect
            key={dimension.key}
            label={`选择${dimension.label}`}
            value={selectedTagFilter(filters.tags, dimension.key)}
            options={[{ value: "", label: `全部${dimension.label}` }, ...dimension.tags.map((tag) => ({ value: tag.slug, label: tag.label }))]}
            onValueChange={(value) => changeFilter("tags", replaceTagFilter(filters.tags, dimension.key, value))}
            disabled={loading || catalogLoading || !dimension.tags.length}
            className="w-full"
          />)}
          <CustomSelect
            label="选择难度"
            value={filters.difficulty}
            options={difficultyOptions}
            onValueChange={(value) => changeFilter("difficulty", value)}
            disabled={loading}
            className="w-full"
          />
          <CustomSelect
            label="选择题型"
            value={filters.type}
            options={typeOptions}
            onValueChange={(value) => changeFilter("type", value)}
            disabled={loading}
            className="w-full"
          />
        </div>
        {catalogError ? <p role="alert" className="mt-2 text-xs font-bold text-coral">{catalogError}</p> : null}
      </section>

      <div className="mt-4 flex items-center gap-3"><div role="progressbar" aria-label="十题挑战进度" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(completed, 10)} className="h-3 flex-1 overflow-hidden rounded-full border border-ink/10 bg-white"><div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min(completed * 10, 100)}%` }} /></div><span className="text-xs font-black text-muted">{completed} / 10</span><button onClick={() => void restartChallenge()} disabled={loading} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-black text-muted hover:bg-white hover:text-violet disabled:opacity-40" title="保留答题记录并重新开始本轮"><RotateCcw size={14} /> 重开</button></div>

      {isAuthenticated && question?.recommendationReason ? <div className="mt-5 flex items-center gap-2 rounded-2xl border-2 border-violet/15 bg-[#f0edff] px-4 py-3 text-sm font-bold text-violet"><WandSparkles size={17} className="shrink-0" />{question.recommendationReason}</div> : null}

      {loading && !question ? <div role="status" aria-live="polite" className="mt-8 grid min-h-[460px] place-items-center rounded-[30px] border-2 border-ink/10 bg-white"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={34} /><p className="mt-3 text-sm font-bold text-muted">正在挑一道刚刚好的题…</p></div></div> : null}
      {error && !question ? <div role="alert" className="mt-8 grid min-h-[420px] place-items-center rounded-[30px] border-2 border-ink/10 bg-white p-8 text-center"><div><CircleAlert className="mx-auto text-coral" size={42} /><h2 className="mt-4 text-xl font-black">暂时没找到题目</h2><p className="mt-2 text-sm font-semibold text-muted">{error}</p><button onClick={() => loadQuestion()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white"><RotateCcw size={16} /> 重试</button></div></div> : null}

      {question ? (
        <article aria-labelledby="practice-question-heading" className="mt-7 overflow-hidden rounded-[30px] border-2 border-ink/10 bg-white shadow-[0_8px_0_#e3dfd4]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/15 px-6 py-4 sm:px-9">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: question.subject.color }}>{question.subject.name}</span><span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{question.grade}</span>{topicTags.map((tag) => <span key={tag.slug} className="rounded-full bg-[#efecff] px-3 py-1.5 text-xs font-bold text-violet">{tag.label}</span>)}</div>
            <div className="flex items-center gap-2"><span className="text-xs font-black text-muted">{typeNames[question.type] ?? question.typeLabel} · {question.difficulty === "EASY" ? "热身" : question.difficulty === "HARD" ? "挑战" : "进阶"}</span>{isAuthenticated ? <button onClick={() => void toggleSaved()} disabled={saving} aria-label={question.isSaved ? "取消收藏" : "收藏题目"} aria-keyshortcuts="S" className={`grid size-11 place-items-center rounded-xl transition ${question.isSaved ? "bg-lime text-ink" : "bg-canvas text-muted hover:text-violet"}`}>{question.isSaved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}</button> : null}</div>
          </div>

          <div className="px-6 py-7 sm:px-9 sm:py-9">
            <h2 ref={questionHeading} id="practice-question-heading" tabIndex={-1} className="question-copy text-[17px] font-bold leading-8 text-ink outline-none sm:text-[19px]"><MathText>{question.stem}</MathText></h2>
            {question.stemAsset ? <Image src={question.stemAsset.path} alt={question.stemAsset.altText} width={720} height={360} className="mx-auto mt-6 h-auto max-h-80 w-full max-w-2xl rounded-2xl border border-ink/10 bg-[#fffdf8] object-contain" /> : null}
            {!result && question.hasHint ? <div className="mt-6">
              {hint ? <div aria-live="polite" className="border-l-4 border-lime bg-[#f7fadf] px-4 py-3 text-sm"><p className="flex items-center gap-2 font-black"><Lightbulb size={17} /> 解题提示</p><div className="mt-2 whitespace-pre-line font-medium leading-6 text-ink/75"><MathText>{hint}</MathText></div></div> : <button onClick={() => void revealHint()} disabled={hintLoading} aria-keyshortcuts="H" className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink/10 bg-canvas px-4 text-sm font-black text-muted transition hover:border-lime hover:text-ink disabled:opacity-50">{hintLoading ? <LoaderCircle className="animate-spin" size={17} /> : <Lightbulb size={17} />} 查看提示</button>}
              {hintError ? <p role="alert" className="mt-2 text-sm font-bold text-coral">{hintError}</p> : null}
            </div> : null}
            {question.options.length ? <div role="group" aria-label={question.type === "MULTIPLE_CHOICE" ? "可多选的答案选项" : "答案选项"} className={`mt-7 grid gap-3 ${hasOptionAssets ? "sm:grid-cols-2" : ""}`}>{question.options.map((option, optionIndex) => {
              const chosen = selected.includes(option.label); const expected = result?.correctLabels.includes(option.label); const wrong = result?.isCorrect === false && chosen && !expected;
              return <button key={option.label} onClick={() => toggleOption(option.label)} disabled={Boolean(result) || loading} aria-pressed={chosen} aria-keyshortcuts={String(optionIndex + 1)} className={`flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition ${expected ? "border-[#2c9b73] bg-[#e6f8ef]" : wrong ? "border-coral bg-[#fff0ed]" : chosen ? "border-violet bg-[#f0edff] shadow-[0_4px_0_#c9c1f7]" : "border-ink/10 bg-[#fbfaf7] hover:border-violet/45 hover:bg-white"}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black ${expected ? "bg-[#2c9b73] text-white" : wrong ? "bg-coral text-white" : chosen ? "bg-violet text-white" : "border-2 border-ink/10 bg-white"}`}>{expected ? <Check size={17} /> : wrong ? <X size={17} /> : option.label}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1 text-[15px] font-semibold leading-6">
                  {option.asset ? <Image src={option.asset.path} alt={option.asset.altText} width={240} height={150} className="h-auto w-full max-w-60 self-center rounded-xl" /> : null}
                  {option.content ? <MathText>{option.content}</MathText> : null}
                </span>
              </button>;
            })}</div> : <><label htmlFor="written-answer" className="sr-only">写下你的思路或答案</label><textarea id="written-answer" value={written} disabled={Boolean(result) || loading} onChange={(event) => setWritten(event.target.value)} placeholder="写下你的思路或答案…" className="mt-7 min-h-32 w-full resize-y rounded-2xl border-2 border-ink/10 bg-[#fbfaf7] p-4 text-[15px] font-medium leading-6 outline-none transition focus:border-violet focus:bg-white" /></>}

            {result ? <div ref={resultPanel} role="status" aria-live="polite" tabIndex={-1} className={`reward-pop mt-7 rounded-[22px] border-2 p-5 outline-none ${result.isCorrect ? "border-[#2c9b73]/30 bg-[#e6f8ef]" : result.isCorrect === false ? "border-coral/30 bg-[#fff0ed]" : "border-violet/25 bg-[#f0edff]"}`}>
              <div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${result.isCorrect ? "bg-[#2c9b73]" : result.isCorrect === false ? "bg-coral" : "bg-violet"}`}>{result.isCorrect ? <Check /> : result.isCorrect === false ? <X /> : <Sparkles />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-black">{result.isCorrect ? `答对了，连胜 ${combo}！` : result.isCorrect === false ? "差一点，找到新线索了" : "对照答案，检查你的思路"}</h3>{isAuthenticated ? <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-black text-lime">+{result.earnedXp} XP</span> : null}</div>{result.answer && <div className="mt-3 text-sm font-semibold leading-6"><span className="font-black">参考答案：</span><MathText>{result.answer}</MathText></div>}{result.explanation && <details ref={explanationDetails} onToggle={(event) => { if (event.currentTarget.open) void recordExplanationView(); }} className="mt-3 text-sm"><summary className="font-black text-violet">展开解析</summary><div className="mt-2 whitespace-pre-line font-medium leading-6 text-ink/75"><MathText>{result.explanation}</MathText></div></details>}</div></div>
              {isAuthenticated ? result.newBadges.map((badge) => <div key={badge.name} className="mt-4 flex items-center gap-2 rounded-xl bg-white/80 p-3 text-sm font-black"><Trophy size={18} className="text-coral" /> 新徽章：{badge.icon} {badge.name}</div>) : null}
              {isAuthenticated && result.streakFreezeUsed ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#eaf8ff] p-3 text-sm font-black text-ink">🛡️ 连续练习保护已生效，昨天的空档没有中断记录。还剩 {result.streakFreezes} 枚保护盾。</div> : null}
              {result.isCorrect === null ? <div className="mt-5 border-t border-violet/15 pt-4"><p className="text-sm font-black">对照参考答案后，你的思路正确吗？</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void selfAssess(true)} disabled={assessing} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#2c9b73] px-4 text-sm font-black text-white"><Check size={17} /> 思路正确</button><button onClick={() => void selfAssess(false)} disabled={assessing} className="flex min-h-11 items-center gap-2 rounded-xl bg-coral px-4 text-sm font-black text-white"><RotateCcw size={16} /> 还需练习</button></div></div> : null}
            </div> : null}
            {error && question ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
            {isAuthenticated ? <div className="mt-6 border-t border-dashed border-ink/10 pt-4">
              {reported ? <p role="status" className="flex items-center gap-2 text-xs font-bold text-[#2c9b73]"><Check size={15} /> 已收到反馈，谢谢你帮助改进题目。</p> : <button onClick={() => setReportOpen((open) => !open)} aria-expanded={reportOpen} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted hover:bg-canvas hover:text-coral"><Flag size={15} /> 这道题有问题</button>}
              {reportOpen && !reported ? <div className="mt-3 rounded-2xl border-2 border-ink/10 bg-canvas p-4"><p className="text-sm font-black">告诉我们哪里需要改进</p><div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]"><CustomSelect label="问题类型" value={reportCategory} options={reportCategoryOptions} onValueChange={setReportCategory} className="w-full" /><input value={reportDetail} onChange={(event) => setReportDetail(event.target.value)} maxLength={1000} placeholder="可选：补充具体情况" className="min-h-11 rounded-xl border-2 border-ink/10 bg-white px-3 text-sm font-medium outline-none focus:border-violet" /></div><div className="mt-3 flex justify-end"><button onClick={() => void reportQuestion()} disabled={reporting} className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-50">{reporting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} 提交反馈</button></div></div> : null}
            </div> : null}
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-ink/10 bg-[#fbfaf7] px-6 py-4 sm:px-9">
            <div className="hidden text-xs font-bold text-muted sm:block"><p>{question.type === "MULTIPLE_CHOICE" ? "可选择多个答案" : question.isAutoGradable ? "选择你认为正确的答案" : "先独立思考，再对照解析"}</p><p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted/80"><Keyboard size={13} /> 数字键选择 · Enter 提交/下一题 · H 提示{isAuthenticated ? " · S 收藏" : ""}</p></div>
            {result ? <button onClick={() => void nextQuestion()} disabled={result.isCorrect === null || assessing} aria-keyshortcuts="Enter" className="ml-auto flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:cursor-not-allowed disabled:opacity-40">{completed >= 10 ? "开始新一轮" : "下一题"} <ChevronRight size={17} /></button> : <button onClick={submit} disabled={!answerable || loading} aria-keyshortcuts="Enter" className="ml-auto flex items-center gap-2 rounded-xl bg-violet px-6 py-3 text-sm font-black text-white shadow-[0_4px_0_#242136] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />} 提交答案</button>}
          </footer>
        </article>
      ) : null}

      {completed >= 10 ? <div role="status" className="reward-pop mt-7 rounded-[26px] border-2 border-ink bg-lime p-6 text-center shadow-[0_7px_0_#242136]"><Trophy className="mx-auto text-violet" size={38} /><h2 className="mt-2 font-display text-2xl font-black">十题挑战完成！</h2><p className="mt-1 text-sm font-bold text-ink/65">本轮答对 {correct} 题。休息一下，或者继续探索。</p></div> : null}
    </div>
  );
}
