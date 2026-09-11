"use client";

import { ArrowRight, BadgeCheck, CheckCircle2, LoaderCircle, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const inputClass = "min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-violet focus:bg-white";

export function RecoveryShell({ children }: { children: React.ReactNode }) {
  return <main id="main-content" className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-8 sm:px-6"><div className="dot-grid absolute inset-0 opacity-45" /><div className="absolute -left-28 -top-28 size-72 rounded-full bg-sky/70 blur-2xl" /><div className="absolute -bottom-32 -right-24 size-80 rounded-full bg-[#d9d3f5]/80 blur-2xl" /><section className="relative w-full max-w-lg rounded-[30px] border-2 border-ink bg-white p-6 shadow-[8px_9px_0_#242136] sm:p-9"><Link href="/practice" className="inline-flex items-center gap-2 font-display text-xl font-black"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link>{children}</section></main>;
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-black">{label}</span><span className="relative block"><span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted">{icon}</span>{children}</span></label>;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "暂时无法发送重置邮件，请稍后再试。");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法发送重置邮件，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Account recovery</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">找回你的学习账号</h1>{submitted ? <div role="status" className="mt-6 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">请检查邮箱</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">如果该邮箱对应一个账号，你会收到一封重置邮件。链接将在 30 分钟后失效。</p><button type="button" onClick={() => { setSubmitted(false); setEmail(""); }} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-violet"><RotateCcw size={16} /> 重新输入邮箱</button></div> : <><p className="mt-2 text-sm font-semibold leading-6 text-muted">输入注册邮箱，我们会发送一个只能使用一次的密码重置链接。</p><form onSubmit={submit} className="mt-6 space-y-4"><Field label="邮箱" icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>发送重置邮件 <ArrowRight size={18} /></>}</button></form></>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">返回登录</Link></p></RecoveryShell>;
}

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const [providersDisconnected, setProvidersDisconnected] = useState(false);
  const pendingFragmentToken = useRef<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    function readToken() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const fragmentToken = params.get("token") || "";
      if (fragmentToken) pendingFragmentToken.current = fragmentToken;
      const value = fragmentToken || pendingFragmentToken.current || "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        pendingFragmentToken.current = null;
        setToken(value);
        if (value) {
          setChanged(false);
          setProvidersDisconnected(false);
          setError("");
          setPassword("");
          setConfirmation("");
        }
      }, 0);
      window.history.replaceState(null, "", "/reset-password");
    }
    readToken();
    window.addEventListener("hashchange", readToken);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", readToken);
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    if (password !== confirmation) {
      setError("两次输入的密码不一致。");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const body = await response.json() as { error?: string; providersDisconnected?: number };
      if (!response.ok) throw new Error(body.error ?? "密码重置失败，请重新申请链接。");
      setProvidersDisconnected((body.providersDisconnected ?? 0) > 0);
      setChanged(true); setToken(""); setPassword(""); setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "密码重置失败，请重新申请链接。");
    } finally {
      setBusy(false);
    }
  }

  if (token === null) return <RecoveryShell><p role="status" className="mt-8 font-bold text-muted">正在验证重置链接…</p></RecoveryShell>;
  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Choose a new password</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">设置新密码</h1>{changed ? <div role="status" className="mt-6 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">密码已更新</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">所有旧登录会话都已退出。{providersDisconnected ? "为确保只有邮箱所有者能够访问，原有社交登录连接也已移除。" : ""}请使用新密码重新登录。</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">前往登录 <ArrowRight size={16} /></Link></div> : !token ? <div role="alert" className="mt-6 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-5"><p className="font-black text-coral">重置链接无效</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">链接可能不完整、已经使用或已经过期。</p><Link href="/forgot-password" className="mt-4 inline-flex min-h-11 items-center gap-2 font-black text-violet">重新申请链接 <ArrowRight size={16} /></Link></div> : <><p className="mt-2 text-sm font-semibold leading-6 text-muted">新密码至少 8 位。更新后，其他设备上的旧会话会立即失效；如果这是尚未验证邮箱的社交账号，原有社交登录连接会一并移除，之后可重新连接。</p><form onSubmit={submit} className="mt-6 space-y-4"><Field label="新密码" icon={<LockKeyhole size={18} />}><input type="password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} /></Field><Field label="再次输入新密码" icon={<LockKeyhole size={18} />}><input type="password" required minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>更新密码 <ArrowRight size={18} /></>}</button></form></>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">返回登录</Link></p></RecoveryShell>;
}

export function EmailVerificationForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [providersDisconnected, setProvidersDisconnected] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const pendingFragmentToken = useRef<string | null>(null);
  const registered = searchParams.get("registered") === "1";
  const passwordSet = searchParams.get("passwordSet") === "1";
  const passwordVerificationScheduled = searchParams.get("delivery") === "scheduled";

  useEffect(() => {
    let timer: number | undefined;
    function readFragment() {
      const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
      if (fragmentToken) pendingFragmentToken.current = fragmentToken;
      const value = fragmentToken || pendingFragmentToken.current || "";
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        pendingFragmentToken.current = null;
        setToken(value);
        setVerified(false);
        setProvidersDisconnected(false);
        setPassword("");
        setError("");
      }, 0);
    }
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", readFragment);
    };
  }, []);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/email-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json() as { error?: string; providersDisconnected?: number };
      if (!response.ok) throw new Error(body.error ?? "验证链接无效或已过期，请重新申请。");
      setProvidersDisconnected((body.providersDisconnected ?? 0) > 0);
      setVerified(true); setToken(""); setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法验证邮箱，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/email-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "暂时无法发送验证邮件，请稍后再试。");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法发送验证邮件，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  if (token === null) return <RecoveryShell><p role="status" className="mt-8 flex items-center gap-2 font-bold text-muted"><LoaderCircle className="animate-spin" size={18} /> 正在读取验证链接…</p></RecoveryShell>;
  if (verified) return <RecoveryShell><div role="status" className="mt-7 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><BadgeCheck className="text-[#557000]" /><h1 className="mt-3 font-display text-3xl font-black">邮箱已验证</h1><p className="mt-2 text-sm font-semibold leading-6 text-muted">现在可以使用邮箱和密码登录。所有旧会话都已退出。{providersDisconnected ? "为确保只有邮箱所有者能够访问，原有社交登录连接也已移除；登录后可以重新连接。" : ""}</p><Link href="/login?verified=1" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">前往登录 <ArrowRight size={16} /></Link></div></RecoveryShell>;

  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Verify your email</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">验证你的邮箱</h1>{token ? <><p className="mt-2 text-sm font-semibold leading-6 text-muted">输入你注册账号或刚设置的密码，确认这封验证邮件和密码属于同一个人。完成后会退出旧会话；尚未证明邮箱所有权的社交登录连接会被移除，登录后可以重新连接。</p><form onSubmit={verify} className="mt-6 space-y-4"><Field label="账号密码" icon={<LockKeyhole size={18} />}><input type="password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>确认密码并验证 <ArrowRight size={18} /></>}</button></form></> : <>{registered ? <div role="status" className="mt-5 rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">账号已创建。请打开验证邮件，并输入注册密码后再登录。未验证且从未使用的注册会在 30 天后自动删除；重新发送邮件不会延长该期限。</div> : passwordSet ? <div role="status" className="mt-5 rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">密码已设置并退出所有旧会话。{passwordVerificationScheduled ? "请打开验证邮件并再次输入刚设置的密码。验证邮箱后，原有社交登录连接可能会被移除。" : "邮箱服务尚未配置；配置后重新发送验证邮件，或使用密码重置流程证明邮箱所有权。"}</div> : <p className="mt-2 text-sm font-semibold leading-6 text-muted">没有收到邮件，或原链接已过期？输入注册邮箱重新发送。只有已设置密码的账号会收到邮件；未验证且从未使用的密码注册最多保留 30 天。</p>}{sent ? <div role="status" className="mt-5 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">请检查邮箱</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">如果该邮箱需要验证且已经设置密码，你会收到一封新邮件。链接最长在 24 小时后失效，也不会超过原注册的 30 天截止时间。</p><button type="button" onClick={() => { setSent(false); setEmail(""); }} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-violet"><RotateCcw size={16} /> 重新输入邮箱</button></div> : <form onSubmit={resend} className="mt-6 space-y-4"><Field label="登录邮箱" icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>重新发送验证邮件 <ArrowRight size={18} /></>}</button></form>}</>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">返回登录</Link></p></RecoveryShell>;
}
