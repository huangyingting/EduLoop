"use client";

import { BookOpenCheck, ChartNoAxesColumnIncreasing, LoaderCircle, RefreshCw, Repeat2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type LearningHealth = {
  windowDays: number;
  sessions: { started: number; completed: number; completionRate: number; averageQuestions: number };
  explanations: { eligibleMisses: number; viewed: number; viewRate: number };
  weeklyReturn: { priorWeekLearners: number; returnedLearners: number; rate: number };
  repeatPractice: { learnerTopicPairs: number; improved: number; regressed: number; unchanged: number; netChangePoints: number; sampled: boolean };
  activity: Array<{ date: string; learners: number; attempts: number; correct: number }>;
};

export function LearningHealthPanel() {
  const [data, setData] = useState<LearningHealth | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/studio/metrics", { cache: "no-store" });
      const body = await response.json() as LearningHealth & { error?: string };
      if (!response.ok) throw new Error(body.error || "学习循环指标加载失败。");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "学习循环指标加载失败。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!data && !error) return <div role="status" className="mt-6 flex min-h-32 items-center justify-center rounded-[26px] border-2 border-ink/10 bg-white"><LoaderCircle className="animate-spin text-violet" /><span className="ml-3 text-sm font-bold text-muted">正在计算学习循环健康度…</span></div>;
  if (!data) return <div role="alert" className="mt-6 flex items-center gap-3 rounded-[26px] border-2 border-coral/30 bg-[#fff0ed] p-5 text-sm font-bold text-coral"><span>{error}</span><button onClick={() => void load()} className="ml-auto flex items-center gap-1 underline"><RefreshCw size={15} /> 重试</button></div>;

  const maxAttempts = Math.max(1, ...data.activity.map(({ attempts }) => attempts));
  const recentActivity = data.activity.slice(-14);
  const cards = [
    { label: "挑战完成率", value: `${data.sessions.completionRate}%`, detail: `${data.sessions.completed} / ${data.sessions.started} 轮`, icon: ChartNoAxesColumnIncreasing, color: "bg-lime" },
    { label: "错后解析打开率", value: `${data.explanations.viewRate}%`, detail: `${data.explanations.viewed} / ${data.explanations.eligibleMisses} 次`, icon: BookOpenCheck, color: "bg-[#d9d3f5]" },
    { label: "七日回访率", value: `${data.weeklyReturn.rate}%`, detail: `${data.weeklyReturn.returnedLearners} / ${data.weeklyReturn.priorWeekLearners} 人`, icon: UsersRound, color: "bg-sky" },
    { label: "复练净变化", value: `${data.repeatPractice.netChangePoints > 0 ? "+" : ""}${data.repeatPractice.netChangePoints} 点`, detail: `${data.repeatPractice.learnerTopicPairs} 组重复主题`, icon: Repeat2, color: "bg-peach" },
  ];

  return <section aria-labelledby="learning-health-title" className="mt-6 rounded-[28px] border-2 border-ink/10 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-violet">Learning loop health</p><h2 id="learning-health-title" className="mt-1 font-display text-2xl font-black">近 {data.windowDays} 天学习循环</h2></div><p className="text-xs font-bold text-muted">每轮平均完成 {data.sessions.averageQuestions} 题{data.repeatPractice.sampled ? " · 复练指标使用最近 20,000 条样本" : ""}</p></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, detail, icon: Icon, color }) => <div key={label} className={`rounded-2xl border-2 border-ink/10 p-4 ${color}`}><Icon size={20} /><p className="mt-3 text-2xl font-black">{value}</p><p className="text-xs font-black">{label}</p><p className="mt-1 text-[11px] font-semibold text-ink/60">{detail}</p></div>)}</div>
    {recentActivity.length ? <div className="mt-6"><div className="flex h-20 items-end gap-1" aria-label="最近十四天答题量">{recentActivity.map((day) => <div key={day.date} className="group relative flex min-w-0 flex-1 justify-center"><div title={`${day.date}: ${day.attempts} 题，${day.learners} 位学习者`} className="w-full max-w-7 rounded-t-md bg-violet/70" style={{ height: `${Math.max(4, Math.round((day.attempts / maxAttempts) * 80))}px` }} /><span className="sr-only">{day.date}：{day.attempts} 题，{day.learners} 位学习者</span></div>)}</div><p className="mt-2 text-right text-[11px] font-bold text-muted">最近 14 个有活动记录的日期</p></div> : <p className="mt-5 rounded-xl bg-canvas p-4 text-sm font-semibold text-muted">还没有足够的练习活动；指标会随学生开始答题自动出现。</p>}
  </section>;
}
