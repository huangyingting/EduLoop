"use client";

import { Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { getDeviceKey, getTimeZone } from "@/lib/learner";

type Day = { date: string; attempts: number };

export function HomeWeeklyProgress() {
  const [days, setDays] = useState<Day[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ deviceKey: getDeviceKey(), timeZone: getTimeZone() });
      try {
        const response = await fetch(`/api/learner/progress?${params}`, { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { activity: Day[] };
          setDays(payload.activity.slice(-7));
        }
      } catch {
        setDays([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
