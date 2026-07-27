import { ArrowRight, Award, BookOpenCheck, Brain, ChevronRight, Play, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { HomeWeeklyProgress } from "@/components/home-weekly-progress";
import { LearnerHeaderStats } from "@/components/learner-provider";
import { SubjectCard } from "@/components/subject-card";
import { SUBJECTS } from "@/lib/content";

const counts: Record<string, string> = { math: "5,389", physics: "2,269", chemistry: "1,634", biology: "1,057" };

export default function Home() {
  return (
    <div className="mx-auto max-w-[1500px] px-5 pb-20 pt-7 sm:px-8 lg:px-10 lg:pt-9 xl:px-14">
      <header className="flex items-center justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-violet">Keep curious, keep growing</p><h1 className="mt-1 font-display text-2xl font-black tracking-tight text-ink">嗨，今天想探索什么？</h1></div>
        <LearnerHeaderStats />
      </header>

      <section className="relative mt-8 min-h-[390px] overflow-hidden rounded-[36px] border-2 border-ink/10 bg-[#d9d3f5] px-7 py-9 shadow-[0_9px_0_#242136] sm:px-10 lg:flex lg:items-center lg:px-14">
        <div className="dot-grid absolute inset-0 opacity-35" />
        <div className="relative z-10 max-w-[650px] lg:w-[58%]">
          <div className="inline-flex -rotate-1 items-center gap-2 rounded-full border-2 border-ink bg-lime px-4 py-2 text-xs font-black uppercase tracking-wider shadow-[3px_3px_0_#242136]"><Target size={15} /> 每日挑战已就绪</div>
          <h2 className="mt-7 font-display text-[44px] font-black leading-[1.03] tracking-[-0.055em] text-ink sm:text-[58px]">把知识练成<br /><span className="relative text-violet">你的超能力<span className="absolute -bottom-1 left-0 h-2 w-full -rotate-1 rounded-full bg-coral/65" /></span></h2>
          <p className="mt-6 max-w-[550px] text-base font-semibold leading-7 text-ink/65">从一道刚刚好的题开始。即时反馈、清楚解析，再加一点点连胜的快乐——每次练习都有回响。</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/practice" className="flex items-center gap-2 rounded-2xl bg-ink px-6 py-3.5 text-sm font-black text-white shadow-[0_6px_0_#6c5ce7] transition hover:-translate-y-1"><Play size={17} fill="currentColor" /> 开始 10 题挑战</Link>
            <Link href="#subjects" className="flex items-center gap-2 rounded-2xl border-2 border-ink/15 bg-white/65 px-6 py-3.5 text-sm font-black text-ink transition hover:bg-white">选择学科 <ArrowRight size={17} /></Link>
          </div>
        </div>
        <div className="hero-orbit absolute -bottom-24 -right-16 hidden size-[470px] lg:block">
          <div className="absolute left-[32%] top-[27%] z-10 grid size-40 rotate-3 place-items-center rounded-[42px] border-[3px] border-ink bg-white text-center shadow-[10px_12px_0_#242136]"><div><Brain className="mx-auto text-violet" size={54} strokeWidth={2.4} /><p className="mt-2 text-sm font-black">LEVEL UP!</p></div></div>
          <span className="absolute left-8 top-24 grid size-16 -rotate-12 place-items-center rounded-2xl border-2 border-ink bg-peach text-3xl shadow-[5px_5px_0_#242136]">π</span>
          <span className="absolute right-10 top-10 grid size-14 rotate-12 place-items-center rounded-full border-2 border-ink bg-lime text-2xl shadow-[4px_4px_0_#242136]">✦</span>
          <span className="absolute bottom-24 right-5 grid size-16 -rotate-6 place-items-center rounded-2xl border-2 border-ink bg-sky text-2xl shadow-[5px_5px_0_#242136]">⚡</span>
        </div>
      </section>

      <section className="mt-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["10,349", "精选题目", BookOpenCheck, "bg-white"], ["3", "学习阶段", Target, "bg-lime"],
          ["4", "核心学科", Brain, "bg-sky"], ["27", "原始题型", Trophy, "bg-peach"],
        ].map(([value, label, Icon, bg]) => (
          <div key={String(label)} className={`flex items-center gap-4 rounded-[22px] border-2 border-ink/10 p-4 ${bg}`}><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Icon size={20} /></span><div><p className="text-xl font-black tracking-tight">{String(value)}</p><p className="text-xs font-bold text-muted">{String(label)}</p></div></div>
        ))}
      </section>

      <section id="subjects" className="scroll-mt-24 pt-14">
        <div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-coral">Choose your track</p><h2 className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">今天的学习路线</h2></div><Link href="/practice" className="hidden items-center gap-1 text-sm font-black text-violet sm:flex">自定义筛选 <ChevronRight size={17} /></Link></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SUBJECTS.map((subject, index) => <SubjectCard key={subject.slug} {...subject} description={subject.description} count={counts[subject.slug]} accent={subject.color} index={index} />)}
        </div>
      </section>

      <section id="progress" className="mt-14 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-[30px] border-2 border-ink/10 bg-ink p-7 text-white shadow-[0_8px_0_#d9d3f5] sm:p-9">
          <div className="absolute -right-10 -top-10 size-44 rounded-full border-[28px] border-violet/35" />
          <div className="relative"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-lime"><Award size={18} /> 成长不是一条直线</div><h2 className="mt-4 max-w-xl font-display text-3xl font-black leading-tight">小步练习，清楚反馈，<br />让每次错误都变成线索。</h2><p className="mt-4 max-w-xl text-sm font-medium leading-6 text-white/65">奖励系统关注持续投入与策略改进，不用排名制造压力。完成练习得 XP，连续学习点亮星环，掌握新主题则解锁徽章。</p><Link href="/practice" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-3 text-sm font-black text-ink">开始积累第一笔 XP <ArrowRight size={17} /></Link></div>
        </div>
        <HomeWeeklyProgress />
      </section>
    </div>
  );
}
