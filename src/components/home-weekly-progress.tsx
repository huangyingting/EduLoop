"use client";

import { Flame, LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { LearnerActivitySummary } from "@/lib/contracts/practice";
import { getTimeZone } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";

type Day = { date: string; attempts: number };

export function HomeWeeklyProgress() {
  const auth = useAuth();
  const [days, setDays] = useState<Day[]>([]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const timer = window.setTimeout(async () => {
      try {
        const payload = await apiRequest<LearnerActivitySummary>("/api/learner/summary", { query: { timeZone: getTimeZone(), days: 7 } });
        setDays(payload.activity);
      } catch {
        setDays([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [auth.status]);

  if (auth.status === "guest") {
    return <div className="rounded-[30px] border-2 border-ink/10 bg-white p-7 shadow-[0_8px_0_#e3dfd4]">
      <p className="text-xs font-black uppercase tracking-[.18em] text-violet">保存你的进度</p>
      <h2 className="mt-3 font-display text-2xl font-black">访客也能马上开练</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted">不用注册就能完成一轮 10 题挑战。注册后可以保存答题记录、错题复习、连续学习天数和徽章。</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/register?next=%2Fpractice" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white shadow-[0_4px_0_#242136]">免费注册</Link>
        <Link href="/login?next=%2F" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink/10 px-5 text-sm font-black text-ink"><LogIn size={16} /> 已有账号，登录</Link>
      </div>
    </div>;
  }

  const practicedDays = days.filter((day) => day.attempts > 0).length;
  return <div className="rounded-[30px] border-2 border-ink/10 bg-white p-7 shadow-[0_8px_0_#e3dfd4]">
    <p className="text-xs font-black uppercase tracking-[.18em] text-violet">最近七天</p>
    <div className="mt-6 flex justify-between">{(days.length ? days : Array.from({ length: 7 }, (_, index) => ({ date: `day-${index}`, attempts: 0 }))).map((day) => {
      const label = day.date.startsWith("day-") ? ["一", "二", "三", "四", "五", "六", "日"][Number(day.date.slice(4))] : new Intl.DateTimeFormat("zh-CN", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`));
      return <div key={day.date} className="text-center"><div className={`grid size-9 place-items-center rounded-full border-2 text-xs font-black ${day.attempts ? "border-ink bg-lime shadow-[2px_2px_0_#242136]" : "border-ink/10 bg-canvas text-muted"}`}>{day.attempts ? "✦" : "·"}</div><p className="mt-2 text-[11px] font-bold text-muted">{label}</p></div>;
    })}</div>
    <div className="mt-7 flex items-center gap-3 rounded-2xl bg-canvas p-4"><span className="grid size-11 place-items-center rounded-xl bg-coral text-white"><Flame /></span><div><p className="text-sm font-black">{practicedDays ? `最近七天点亮 ${practicedDays} 天` : "从今天开始连续学习"}</p><p className="text-xs font-semibold text-muted">{practicedDays ? "每一次回来都值得记录" : "完成 1 题即可点亮今天"}</p></div></div>
  </div>;
}
