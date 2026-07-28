"use client";

import { BarChart3, BookmarkCheck, ClipboardCheck, Compass, Flame, Home, LogIn, LogOut, Menu, ShieldCheck, Sparkles, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LearnerProvider, useLearner } from "./learner-provider";
import { Logo } from "./logo";
import { useAuth } from "@/lib/use-auth";
import { rotateDeviceKey } from "@/lib/learner";
import { isContentOperator } from "@/lib/user-roles";

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
  const [desktopNavigation, setDesktopNavigation] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const { stats } = useLearner();
  const auth = useAuth();
  const navigationLinks = isContentOperator(auth.user)
    ? [...links, { href: "/studio", label: "内容审核台", icon: ClipboardCheck }]
    : links;
  const remainingToday = Math.max(10 - stats.todayAttempts, 0);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktopNavigation(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || desktopNavigation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigation.current?.querySelector<HTMLElement>("a, button")?.focus();
    function keepFocusInside(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(navigation.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", keepFocusInside);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keepFocusInside);
    };
  }, [desktopNavigation, open]);
  if (pathname === "/login" || pathname === "/register") return children;

  async function signOut() {
    try {
      await auth.logout();
      rotateDeviceKey();
      window.location.assign("/");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "退出登录失败，请重试。");
    }
  }
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 flex h-[72px] items-center justify-between border-b border-ink/10 bg-canvas/90 px-5 backdrop-blur-xl lg:hidden">
        <Logo />
        <button ref={menuButton} onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-2xl border-2 border-ink/10 bg-white" aria-label={open ? "关闭导航" : "打开导航"} aria-expanded={open} aria-controls="primary-navigation">
          {open ? <X /> : <Menu />}
        </button>
      </header>

      <aside ref={navigation} id="primary-navigation" aria-label="主要导航" aria-hidden={!desktopNavigation && !open} inert={!desktopNavigation && !open} className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col overflow-y-auto border-r border-ink/10 bg-[#fbfaf6] px-5 py-6 transition-transform lg:translate-x-0`}>
        <div className="px-2"><Logo /></div>
        <nav aria-label="学习功能" className="mt-12 space-y-2">
          {navigationLinks.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);
            return (
              <Link key={label} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition ${active ? "bg-ink text-white shadow-[0_5px_0_#d9d3f5]" : "text-muted hover:bg-white hover:text-ink"}`}>
                <Icon size={19} strokeWidth={2.4} />{label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[24px] border-2 border-ink/10 bg-lime p-4 shadow-[0_6px_0_#242136]">
          <div className="flex items-center gap-2 text-sm font-black text-ink"><Sparkles size={18} /> 今日小目标</div>
          <div role="progressbar" aria-label="今日十题目标" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(stats.todayAttempts, 10)} className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min(stats.todayAttempts * 10, 100)}%` }} /></div>
          <p className="mt-2 text-xs font-semibold text-ink/65">{remainingToday ? `再完成 ${remainingToday} 题，点亮今日星环` : "今日星环已点亮，做得好！"}</p>
        </div>
        <div className="mt-5 flex items-center gap-3 px-2">
          <div className="grid size-10 place-items-center rounded-full bg-peach text-lg">🧑‍🚀</div>
          <div className="min-w-0"><p className="truncate text-sm font-extrabold text-ink">{auth.user?.displayName || (auth.status === "authenticated" ? auth.user?.email : "匿名探索者")}</p><p className="text-xs text-muted">Level {stats.level} · {stats.xp} XP</p></div>
          <div className="ml-auto flex items-center gap-1 text-xs font-black text-coral"><Flame size={20} />{stats.currentStreak}</div>
        </div>
        {auth.status === "authenticated" ? (
          <button onClick={() => void signOut()} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink/10 bg-white text-xs font-black text-muted hover:border-coral/30 hover:text-coral"><LogOut size={15} /> 退出登录</button>
        ) : (
          <Link href="/login" onClick={() => setOpen(false)} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet text-xs font-black text-white shadow-[0_4px_0_#242136]"><LogIn size={15} /> 登录同步进度</Link>
        )}
        <Link href="/privacy" onClick={() => setOpen(false)} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold text-muted hover:bg-white hover:text-ink"><ShieldCheck size={15} /> 数据与隐私</Link>
      </aside>

      {open && <button className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-label="关闭导航" />}
      <main id="main-content" inert={!desktopNavigation && open} className="min-h-screen lg:pl-[270px]">{children}</main>
    </div>
  );
}
