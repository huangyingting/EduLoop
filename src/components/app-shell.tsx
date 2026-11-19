"use client";

import { BarChart3, BookmarkCheck, ClipboardCheck, Compass, Flame, GraduationCap, Home, Library, LogIn, LogOut, Menu, School, ShieldCheck, Sparkles, Target, Trophy, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LearnerProvider, useLearner } from "./learner-provider";
import { LearnerSwitcher } from "./learner-switcher";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { useT } from "@/i18n/client";
import { useAuth } from "@/lib/use-auth";
import { isContentOperator, isTeacher } from "@/lib/user-roles";

const links = [
  { href: "/", label: "home", icon: Home },
  { href: "/practice", label: "practice", icon: Target },
  { href: "/#subjects", label: "subjects", icon: Compass },
  { href: "/progress", label: "progress", icon: BarChart3 },
  { href: "/review", label: "review", icon: BookmarkCheck },
  { href: "/contest", label: "contest", icon: Trophy },
  { href: "/browse", label: "browse", icon: Library },
] as const;
const standaloneRoutes = new Set([
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/change-email", "/consent", "/privacy-policy", "/terms", "/offline",
]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (standaloneRoutes.has(pathname)) return children;
  return <LearnerProvider><AppShellContent>{children}</AppShellContent></LearnerProvider>;
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [desktopNavigation, setDesktopNavigation] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const { stats } = useLearner();
  const auth = useAuth();
  const t = useT();
  const navigationLinks = auth.status === "authenticated"
    ? [
      ...links,
      { href: "/classes", label: "classes", icon: School } as const,
      ...(isTeacher(auth.user) ? [{ href: "/teach", label: "teach", icon: GraduationCap } as const] : []),
      ...(isContentOperator(auth.user) ? [{ href: "/studio", label: "studio", icon: ClipboardCheck } as const] : []),
    ]
    : links.filter(({ href }) => href === "/" || href === "/practice" || href === "/#subjects");
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
  async function signOut() {
    try {
      await auth.logout();
      router.replace("/practice");
      router.refresh();
    } catch {
      window.alert(t("shell.signOutFailed"));
    }
  }
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 flex h-[72px] items-center justify-between border-b border-ink/10 bg-canvas/90 px-5 backdrop-blur-xl lg:hidden">
        <Logo href="/" />
        <button ref={menuButton} onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-2xl border-2 border-ink/10 bg-white" aria-label={open ? t("shell.closeNavigation") : t("shell.openNavigation")} aria-expanded={open} aria-controls="primary-navigation">
          {open ? <X /> : <Menu />}
        </button>
      </header>

      <aside ref={navigation} id="primary-navigation" aria-label={t("shell.primaryNavigation")} aria-hidden={!desktopNavigation && !open} inert={!desktopNavigation && !open} className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col overflow-y-auto border-r border-ink/10 bg-[#fbfaf6] px-5 py-4 transition-transform lg:translate-x-0`}>
        <div className="px-2"><Logo href="/" /></div>
        <nav aria-label={t("shell.learningNavigation")} className="mt-8 space-y-1">
          {navigationLinks.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : href.includes("#") ? false : pathname.startsWith(href);
            return (
              <Link key={label} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition ${active ? "bg-ink text-white shadow-[0_5px_0_#d9d3f5]" : "text-muted hover:bg-white hover:text-ink"}`}>
                <Icon size={19} strokeWidth={2.4} />{t(`shell.nav.${label}`)}
              </Link>
            );
          })}
        </nav>

        {auth.status === "authenticated" ? <div className="mt-auto rounded-[24px] border-2 border-ink/10 bg-lime p-3 shadow-[0_5px_0_#242136]">
          <div className="flex items-center gap-2 text-sm font-black text-ink"><Sparkles size={18} /> {t("shell.dailyGoal")}</div>
          <div role="progressbar" aria-label={t("shell.dailyGoalProgress")} aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(stats.todayAttempts, 10)} className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min(stats.todayAttempts * 10, 100)}%` }} /></div>
          <p className="mt-1.5 text-xs font-semibold text-ink/65">{remainingToday ? t("shell.dailyGoalRemaining", { count: remainingToday }) : t("shell.dailyGoalDone")}</p>
        </div> : <div className="mt-auto rounded-[24px] border-2 border-violet/20 bg-[#f0edff] p-3 text-sm font-semibold leading-5 text-muted">{t("shell.guestNotice")}</div>}
        {auth.status === "authenticated" ? <LearnerSwitcher /> : null}
        {auth.status === "authenticated" ? <Link href="/profile" onClick={() => setOpen(false)} className="mt-3 flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-white" aria-label={t("shell.manageProfile")}>
          <div className="grid size-9 place-items-center rounded-full bg-peach text-base">🧑‍🚀</div>
          <div className="min-w-0"><p className="truncate text-sm font-extrabold text-ink">{auth.user?.displayName || (auth.status === "authenticated" ? auth.user?.email : t("shell.anonymousLearner"))}</p><p className="text-xs text-muted">Level {stats.level} · {stats.xp} XP</p></div>
          <div className="ml-auto flex items-center gap-1 text-xs font-black text-coral"><Flame size={20} />{stats.currentStreak}</div>
        </Link> : null}
        {auth.status === "authenticated" ? (
          <button onClick={() => void signOut()} className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink/10 bg-white text-xs font-black text-muted hover:border-coral/30 hover:text-coral"><LogOut size={15} /> {t("shell.signOut")}</button>
        ) : (
          <>
            <Link href="/login?next=%2Fpractice" onClick={() => setOpen(false)} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet text-xs font-black text-white shadow-[0_4px_0_#242136]"><LogIn size={15} /> {t("shell.signInToSave")}</Link>
            <Link href="/register?next=%2Fpractice" onClick={() => setOpen(false)} className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink/10 bg-white text-xs font-black text-ink hover:border-violet/40">{t("common.register")}</Link>
          </>
        )}
        {auth.status === "authenticated" ? <Link href="/privacy" onClick={() => setOpen(false)} className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold text-muted hover:bg-white hover:text-ink"><ShieldCheck size={15} /> {t("shell.dataPrivacy")}</Link> : null}
        <div className="mt-1 flex items-center justify-center gap-3 text-[11px] font-bold text-muted"><Link href="/terms" onClick={() => setOpen(false)} className="hover:text-ink hover:underline">{t("shell.terms")}</Link><Link href="/privacy-policy" onClick={() => setOpen(false)} className="hover:text-ink hover:underline">{t("shell.privacyPolicy")}</Link></div>
        <LocaleSwitcher className="mt-1 justify-center" />
      </aside>

      {open && <button className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-label={t("shell.closeNavigation")} />}
      <main id="main-content" inert={!desktopNavigation && open} className="min-h-screen lg:pl-[270px]">{children}</main>
    </div>
  );
}
