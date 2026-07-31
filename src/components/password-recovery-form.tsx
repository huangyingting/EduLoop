"use client";

import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const inputClass = "min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-violet focus:bg-white";

function RecoveryShell({ children }: { children: React.ReactNode }) {
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

  useEffect(() => {
    let timer: number | undefined;
    function readToken() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const value = params.get("token") || "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setToken(value);
        if (value) {
          setChanged(false);
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
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "密码重置失败，请重新申请链接。");
      setChanged(true); setToken(""); setPassword(""); setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "密码重置失败，请重新申请链接。");
    } finally {
      setBusy(false);
    }
  }

  if (token === null) return <RecoveryShell><p role="status" className="mt-8 font-bold text-muted">正在验证重置链接…</p></RecoveryShell>;
  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Choose a new password</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">设置新密码</h1>{changed ? <div role="status" className="mt-6 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">密码已更新</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">所有旧登录会话都已退出。请使用新密码重新登录。</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">前往登录 <ArrowRight size={16} /></Link></div> : !token ? <div role="alert" className="mt-6 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-5"><p className="font-black text-coral">重置链接无效</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">链接可能不完整、已经使用或已经过期。</p><Link href="/forgot-password" className="mt-4 inline-flex min-h-11 items-center gap-2 font-black text-violet">重新申请链接 <ArrowRight size={16} /></Link></div> : <><p className="mt-2 text-sm font-semibold leading-6 text-muted">新密码至少 8 位。更新后，其他设备上的旧会话会立即失效。</p><form onSubmit={submit} className="mt-6 space-y-4"><Field label="新密码" icon={<LockKeyhole size={18} />}><input type="password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} /></Field><Field label="再次输入新密码" icon={<LockKeyhole size={18} />}><input type="password" required minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>更新密码 <ArrowRight size={18} /></>}</button></form></>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">返回登录</Link></p></RecoveryShell>;
}
