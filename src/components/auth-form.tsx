"use client";

import { ArrowRight, BookOpenCheck, LoaderCircle, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { getDeviceKey } from "@/lib/learner";
import { safeReturnPath } from "@/lib/auth-validation";
import { setAuthenticatedUser } from "@/lib/use-auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";
  const next = safeReturnPath(searchParams.get("next"));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          deviceKey: getDeviceKey(),
          ...(isLogin ? {} : { displayName: displayName.trim() || undefined }),
        }),
      });
      const body = await response.json() as { user?: { id: string; email: string; displayName: string | null }; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error ?? "暂时无法登录，请稍后重试。");
      setAuthenticatedUser(body.user);
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法登录，请稍后重试。");
      setBusy(false);
    }
  }

  const alternate = isLogin ? "/register" : "/login";
  const alternateHref = next === "/" ? alternate : `${alternate}?next=${encodeURIComponent(next)}`;

  return (
    <main id="main-content" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-5 py-12">
      <div className="dot-grid absolute inset-0 opacity-45" />
      <div className="absolute -left-28 -top-28 size-72 rounded-full bg-sky/70 blur-2xl" />
      <div className="absolute -bottom-32 -right-24 size-80 rounded-full bg-[#d9d3f5]/80 blur-2xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[34px] border-2 border-ink bg-white shadow-[10px_12px_0_#242136] lg:grid-cols-[.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden bg-violet p-10 text-white lg:block">
          <div className="dot-grid absolute inset-0 opacity-20" />
          <div className="relative">
            <Link href="/" className="inline-flex items-center gap-2 font-display text-2xl font-black"><span className="grid size-10 place-items-center rounded-2xl bg-lime text-ink">∞</span>EduLoop</Link>
            <div className="mt-20 inline-flex -rotate-2 items-center gap-2 rounded-full border-2 border-ink bg-lime px-4 py-2 text-xs font-black text-ink shadow-[4px_4px_0_#242136]"><Sparkles size={15} /> 进度跟着你走</div>
            <h1 className="mt-7 font-display text-4xl font-black leading-tight">把今天的努力，<br />带到每一台设备。</h1>
            <ul className="mt-8 space-y-4 text-sm font-bold text-white/85">
              <li className="flex items-center gap-3"><BookOpenCheck className="text-lime" /> 保留 XP、连续学习和答题记录</li>
              <li className="flex items-center gap-3"><Sparkles className="text-lime" /> 同步错题、收藏和复习计划</li>
              <li className="flex items-center gap-3"><LockKeyhole className="text-lime" /> 安全会话，密码不会明文保存</li>
            </ul>
          </div>
        </section>

        <section className="p-7 sm:p-10 lg:p-12">
          <Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-black lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link>
          <p className="mt-8 text-xs font-black uppercase tracking-[.2em] text-coral lg:mt-0">{isLogin ? "Welcome back" : "Start your learning loop"}</p>
          <h2 className="mt-2 font-display text-3xl font-black tracking-tight">{isLogin ? "欢迎回来，探索者" : "创建你的学习账号"}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted">{isLogin ? "登录后继续你的学习路线。" : "当前浏览器中的匿名学习进度会自动加入账号。"}</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {!isLogin ? <Field label="昵称（选填）" icon={<UserRound size={18} />}><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} autoComplete="name" placeholder="例如：星空探索者" className={inputClass} /></Field> : null}
            <Field label="邮箱" icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>
            <Field label="密码" icon={<LockKeyhole size={18} />}><input type="password" required minLength={isLogin ? undefined : 8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isLogin ? "current-password" : "new-password"} placeholder={isLogin ? "输入密码" : "至少 8 位字符"} className={inputClass} /></Field>

            {error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
            <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-black text-white shadow-[0_5px_0_#6c5ce7] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{isLogin ? "登录并继续" : "创建账号"}<ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-semibold text-muted">{isLogin ? "还没有账号？" : "已经有账号？"} <Link href={alternateHref} className="font-black text-violet hover:underline">{isLogin ? "免费注册" : "直接登录"}</Link></p>
          <p className="mt-4 text-center text-xs font-semibold text-muted"><Link href={next} className="hover:text-ink hover:underline">暂时以匿名访客继续</Link></p>
        </section>
      </div>
    </main>
  );
}

const inputClass = "min-h-12 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-violet focus:bg-white";

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-black">{label}</span><span className="relative block"><span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted">{icon}</span>{children}</span></label>;
}
