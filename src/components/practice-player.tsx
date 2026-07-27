"use client";

import { Check, ChevronRight, CircleAlert, Flame, LoaderCircle, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceKey, getTimeZone } from "@/lib/learner";
import { useLearner } from "./learner-provider";
import { MathText } from "./math-text";

type Question = {
  id: string; stem: string; type: string; typeLabel: string; difficulty: string; isAutoGradable: boolean;
  subject: { name: string; slug: string; color: string }; grade: string;
  stemAsset: { path: string; altText: string } | null;
  options: Array<{ label: string; content: string; asset: { path: string; altText: string } | null }>;
  tags: Array<{ dimension: string; slug: string; label: string }>;
};
type Result = { isCorrect: boolean | null; correctLabels: string[]; answer: string; explanation: string | null; earnedXp: number; totalXp: number; level: number; currentStreak: number; todayAttempts: number; newBadges: Array<{ name: string; icon: string }> };
type TagCatalog = Array<{ key: string; label: string; tags: Array<{ slug: string; label: string }> }>;

const typeNames: Record<string, string> = { SINGLE_CHOICE: "单项选择", MULTIPLE_CHOICE: "多项选择", TRUE_FALSE: "判断", FILL_BLANK: "填空", COMPUTATION: "计算", EXPERIMENT: "实验探究", WRITTEN_RESPONSE: "解答" };
const subjects = [{ slug: "", label: "全部" }, { slug: "math", label: "数学" }, { slug: "physics", label: "物理" }, { slug: "chemistry", label: "化学" }, { slug: "biology", label: "生物" }];
const bands = [{ slug: "", label: "全学段" }, { slug: "primary", label: "小学" }, { slug: "middle", label: "初中" }, { slug: "high", label: "高中" }];

export function PracticePlayer() {
  const search = useSearchParams();
  const { stats, applyAttempt } = useLearner();
  const [filters, setFilters] = useState({ subject: search.get("subject") ?? "", gradeBand: search.get("gradeBand") ?? "", difficulty: search.get("difficulty") ?? "", type: search.get("type") ?? "", tags: search.get("tags") ?? "" });
  const [tagCatalog, setTagCatalog] = useState<TagCatalog>([]);
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
  const startedAt = useRef(0);
  const questionRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);

  const loadQuestion = useCallback(async (nextFilters = filters, excluded = recent) => {
    const generation = ++requestGeneration.current;
    questionRequest.current?.abort();
    const controller = new AbortController();
    questionRequest.current = controller;
    setLoading(true); setQuestion(null); setError(""); setResult(null); setSelected([]); setWritten("");
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => value && params.set(key, value));
    if (excluded.length) params.set("exclude", excluded.join(","));
    try {
      const response = await fetch(`/api/questions/next?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 404 ? "这个组合暂时没有可用题目，换个筛选试试吧。" : "题目加载失败，请稍后再试。");
      const payload = await response.json() as Question;
      if (generation !== requestGeneration.current) return;
      setQuestion(payload); setRecent((items) => [...items.slice(-7), payload.id]); startedAt.current = Date.now();
    } catch (cause) {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      setError(cause instanceof Error ? cause.message : "加载失败");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [filters, recent]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQuestion(filters), 0);
    return () => { window.clearTimeout(timer); questionRequest.current?.abort(); };
    // The initial URL-derived filters are intentionally loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/catalog").then((response) => response.ok ? response.json() : []).then((payload: TagCatalog) => { if (active) setTagCatalog(payload); });
    return () => { active = false; };
  }, []);

  function changeFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value }; setFilters(next); setRecent([]); void loadQuestion(next, []);
  }

  function toggleOption(label: string) {
    if (!question || result || loading) return;
    if (question.type === "MULTIPLE_CHOICE") setSelected((items) => items.includes(label) ? items.filter((item) => item !== label) : [...items, label]);
    else setSelected([label]);
  }

  async function submit() {
    if (!question || result || (question.options.length ? !selected.length : !written.trim())) return;
    setLoading(true);
    try {
      const response = await fetch("/api/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        questionId: question.id, deviceKey: getDeviceKey(), timeZone: getTimeZone(), response: question.options.length ? selected : written.trim(), secondsSpent: Math.round((Date.now() - startedAt.current) / 1000),
      }) });
      if (!response.ok) throw new Error("答案提交失败，请再试一次。");
      const payload = await response.json() as Result; setResult(payload); setCompleted((value) => value + 1); applyAttempt(payload);
      if (payload.isCorrect) { setCorrect((value) => value + 1); setCombo((value) => value + 1); } else if (payload.isCorrect === false) setCombo(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setLoading(false); }
  }

  const answerable = question?.options.length ? selected.length > 0 : written.trim().length > 0;
  const topicTags = question?.tags.filter((tag) => tag.dimension === "TOPIC").slice(0, 2) ?? [];
  const hasOptionAssets = question?.options.some((option) => option.asset) ?? false;

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Focus mode</p><h1 className="mt-1 font-display text-3xl font-black tracking-[-.04em]">专注练习</h1></div>
        <div className="flex gap-2">
          <div className="rounded-2xl border-2 border-ink/10 bg-white px-4 py-2 text-sm font-black shadow-[0_4px_0_#e3dfd4]"><Flame className="mr-1.5 inline text-coral" size={17} />{combo} 连胜</div>
          <div className="rounded-2xl bg-ink px-4 py-2 text-sm font-black text-white"><Sparkles className="mr-1.5 inline text-lime" size={17} />{stats.xp} XP</div>
        </div>
      </header>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        <select disabled={loading} aria-label="选择学科" value={filters.subject} onChange={(event) => changeFilter("subject", event.target.value)} className="min-w-28 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet disabled:opacity-50">{subjects.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select>
        <select disabled={loading} aria-label="选择学段" value={filters.gradeBand} onChange={(event) => changeFilter("gradeBand", event.target.value)} className="min-w-28 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet disabled:opacity-50">{bands.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select>
        <select disabled={loading} aria-label="选择难度" value={filters.difficulty} onChange={(event) => changeFilter("difficulty", event.target.value)} className="min-w-28 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet disabled:opacity-50"><option value="">全部难度</option><option value="EASY">热身</option><option value="MEDIUM">进阶</option><option value="HARD">挑战</option></select>
        <select disabled={loading} aria-label="选择题型" value={filters.type} onChange={(event) => changeFilter("type", event.target.value)} className="min-w-32 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet disabled:opacity-50"><option value="">全部题型</option>{Object.entries(typeNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select disabled={loading} aria-label="选择主题或能力标签" value={filters.tags} onChange={(event) => changeFilter("tags", event.target.value)} className="min-w-36 rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet disabled:opacity-50"><option value="">全部主题 / 能力</option>{tagCatalog.map((dimension) => <optgroup key={dimension.key} label={dimension.label}>{dimension.tags.map((tag) => <option key={`${dimension.key}:${tag.slug}`} value={tag.slug}>{tag.label}</option>)}</optgroup>)}</select>
      </div>

      <div className="mt-4 flex items-center gap-3"><div className="h-3 flex-1 overflow-hidden rounded-full border border-ink/10 bg-white"><div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min(completed * 10, 100)}%` }} /></div><span className="text-xs font-black text-muted">{completed} / 10</span></div>

      {loading && !question ? <div className="mt-8 grid min-h-[460px] place-items-center rounded-[30px] border-2 border-ink/10 bg-white"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={34} /><p className="mt-3 text-sm font-bold text-muted">正在挑一道刚刚好的题…</p></div></div> : null}
      {error && !question ? <div className="mt-8 grid min-h-[420px] place-items-center rounded-[30px] border-2 border-ink/10 bg-white p-8 text-center"><div><CircleAlert className="mx-auto text-coral" size={42} /><h2 className="mt-4 text-xl font-black">暂时没找到题目</h2><p className="mt-2 text-sm font-semibold text-muted">{error}</p><button onClick={() => loadQuestion()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white"><RotateCcw size={16} /> 重试</button></div></div> : null}

      {question ? (
        <article className="mt-7 overflow-hidden rounded-[30px] border-2 border-ink/10 bg-white shadow-[0_8px_0_#e3dfd4]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/15 px-6 py-4 sm:px-9">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: question.subject.color }}>{question.subject.name}</span><span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{question.grade}</span>{topicTags.map((tag) => <span key={tag.slug} className="rounded-full bg-[#efecff] px-3 py-1.5 text-xs font-bold text-violet">{tag.label}</span>)}</div>
            <span className="text-xs font-black text-muted">{typeNames[question.type] ?? question.typeLabel} · {question.difficulty === "EASY" ? "热身" : question.difficulty === "HARD" ? "挑战" : "进阶"}</span>
          </div>

          <div className="px-6 py-7 sm:px-9 sm:py-9">
            <div className="question-copy text-[17px] font-bold leading-8 text-ink sm:text-[19px]"><MathText>{question.stem}</MathText></div>
            {question.stemAsset ? <Image src={question.stemAsset.path} alt={question.stemAsset.altText} width={720} height={360} className="mx-auto mt-6 h-auto max-h-80 w-full max-w-2xl rounded-2xl border border-ink/10 bg-[#fffdf8] object-contain" /> : null}
            {question.options.length ? <div className={`mt-7 grid gap-3 ${hasOptionAssets ? "sm:grid-cols-2" : ""}`}>{question.options.map((option) => {
              const chosen = selected.includes(option.label); const expected = result?.correctLabels.includes(option.label); const wrong = result?.isCorrect === false && chosen && !expected;
              return <button key={option.label} onClick={() => toggleOption(option.label)} disabled={Boolean(result) || loading} className={`flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition ${expected ? "border-[#2c9b73] bg-[#e6f8ef]" : wrong ? "border-coral bg-[#fff0ed]" : chosen ? "border-violet bg-[#f0edff] shadow-[0_4px_0_#c9c1f7]" : "border-ink/10 bg-[#fbfaf7] hover:border-violet/45 hover:bg-white"}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black ${expected ? "bg-[#2c9b73] text-white" : wrong ? "bg-coral text-white" : chosen ? "bg-violet text-white" : "border-2 border-ink/10 bg-white"}`}>{expected ? <Check size={17} /> : wrong ? <X size={17} /> : option.label}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1 text-[15px] font-semibold leading-6">
                  {option.asset ? <Image src={option.asset.path} alt={option.asset.altText} width={240} height={150} className="h-auto w-full max-w-60 self-center rounded-xl" /> : null}
                  {option.content ? <MathText>{option.content}</MathText> : null}
                </span>
              </button>;
            })}</div> : <textarea value={written} disabled={Boolean(result) || loading} onChange={(event) => setWritten(event.target.value)} placeholder="写下你的思路或答案…" className="mt-7 min-h-32 w-full resize-y rounded-2xl border-2 border-ink/10 bg-[#fbfaf7] p-4 text-[15px] font-medium leading-6 outline-none transition focus:border-violet focus:bg-white" />}

            {result ? <div className={`reward-pop mt-7 rounded-[22px] border-2 p-5 ${result.isCorrect ? "border-[#2c9b73]/30 bg-[#e6f8ef]" : result.isCorrect === false ? "border-coral/30 bg-[#fff0ed]" : "border-violet/25 bg-[#f0edff]"}`}>
              <div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${result.isCorrect ? "bg-[#2c9b73]" : result.isCorrect === false ? "bg-coral" : "bg-violet"}`}>{result.isCorrect ? <Check /> : result.isCorrect === false ? <X /> : <Sparkles />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-black">{result.isCorrect ? `答对了，连胜 ${combo}！` : result.isCorrect === false ? "差一点，找到新线索了" : "对照答案，检查你的思路"}</h3><span className="rounded-full bg-ink px-2.5 py-1 text-xs font-black text-lime">+{result.earnedXp} XP</span></div>{result.answer && <div className="mt-3 text-sm font-semibold leading-6"><span className="font-black">参考答案：</span><MathText>{result.answer}</MathText></div>}{result.explanation && <details className="mt-3 text-sm"><summary className="font-black text-violet">展开解析</summary><div className="mt-2 whitespace-pre-line font-medium leading-6 text-ink/75"><MathText>{result.explanation}</MathText></div></details>}</div></div>
              {result.newBadges.map((badge) => <div key={badge.name} className="mt-4 flex items-center gap-2 rounded-xl bg-white/80 p-3 text-sm font-black"><Trophy size={18} className="text-coral" /> 新徽章：{badge.icon} {badge.name}</div>)}
            </div> : null}
            {error && question ? <p className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-ink/10 bg-[#fbfaf7] px-6 py-4 sm:px-9">
            <p className="hidden text-xs font-bold text-muted sm:block">{question.type === "MULTIPLE_CHOICE" ? "可选择多个答案" : question.isAutoGradable ? "选择你认为正确的答案" : "先独立思考，再对照解析"}</p>
            {result ? <button onClick={() => loadQuestion()} className="ml-auto flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-black text-white shadow-[0_4px_0_#6c5ce7]">下一题 <ChevronRight size={17} /></button> : <button onClick={submit} disabled={!answerable || loading} className="ml-auto flex items-center gap-2 rounded-xl bg-violet px-6 py-3 text-sm font-black text-white shadow-[0_4px_0_#242136] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />} 提交答案</button>}
          </footer>
        </article>
      ) : null}

      {completed >= 10 ? <div className="reward-pop mt-7 rounded-[26px] border-2 border-ink bg-lime p-6 text-center shadow-[0_7px_0_#242136]"><Trophy className="mx-auto text-violet" size={38} /><h2 className="mt-2 font-display text-2xl font-black">十题挑战完成！</h2><p className="mt-1 text-sm font-bold text-ink/65">本轮答对 {correct} 题。休息一下，或者继续探索。</p></div> : null}
    </div>
  );
}
