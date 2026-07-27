"use client";

import { BarChart3, BookmarkCheck, Compass, Flame, Home, Menu, ShieldCheck, Sparkles, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LearnerProvider, useLearner } from "./learner-provider";
import { Logo } from "./logo";

const links = [
  { href: "/", label: "学习大厅", icon: Home },
  { href: "/practice", label: "开始练习", icon: Target },
  { href: "/#subjects", label: "发现学科", icon: Compass },
  { href: "/progress", label: "我的成长", icon: BarChart3 },
  { href: "/review", label: "错题与收藏", icon: BookmarkCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return <LearnerProvider><AppShellContent>{children}</AppShellContent></LearnerProvider>;
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { stats } = useLearner();
  const remainingToday = Math.max(10 - stats.todayAttempts, 0);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 flex h-[72px] items-center justify-between border-b border-ink/10 bg-canvas/90 px-5 backdrop-blur-xl lg:hidden">
        <Logo />
        <button onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-2xl border-2 border-ink/10 bg-white" aria-label={open ? "关闭导航" : "打开导航"} aria-expanded={open} aria-controls="primary-navigation">
          {open ? <X /> : <Menu />}
        </button>
      </header>

      <aside id="primary-navigation" className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col overflow-y-auto border-r border-ink/10 bg-[#fbfaf6] px-5 py-6 transition-transform lg:translate-x-0`}>
        <div className="px-2"><Logo /></div>
        <nav className="mt-12 space-y-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);
            return (
              <Link key={label} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition ${active ? "bg-ink text-white shadow-[0_5px_0_#d9d3f5]" : "text-muted hover:bg-white hover:text-ink"}`}>
                <Icon size={19} strokeWidth={2.4} />{label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[24px] border-2 border-ink/10 bg-lime p-4 shadow-[0_6px_0_#242136]">
          <div className="flex items-center gap-2 text-sm font-black text-ink"><Sparkles size={18} /> 今日小目标</div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min(stats.todayAttempts * 10, 100)}%` }} /></div>
          <p className="mt-2 text-xs font-semibold text-ink/65">{remainingToday ? `再完成 ${remainingToday} 题，点亮今日星环` : "今日星环已点亮，做得好！"}</p>
        </div>
        <div className="mt-5 flex items-center gap-3 px-2">
          <div className="grid size-10 place-items-center rounded-full bg-peach text-lg">🧑‍🚀</div>
          <div><p className="text-sm font-extrabold text-ink">探索者</p><p className="text-xs text-muted">Level {stats.level} · {stats.xp} XP</p></div>
          <div className="ml-auto flex items-center gap-1 text-xs font-black text-coral"><Flame size={20} />{stats.currentStreak}</div>
        </div>
        <Link href="/privacy" onClick={() => setOpen(false)} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold text-muted hover:bg-white hover:text-ink"><ShieldCheck size={15} /> 数据与隐私</Link>
      </aside>

      {open && <button className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-label="关闭导航" />}
      <main id="main-content" className="min-h-screen lg:pl-[270px]">{children}</main>
    </div>
  );
}
