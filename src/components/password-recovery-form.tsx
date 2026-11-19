"use client";

import { ArrowRight, BadgeCheck, CheckCircle2, LoaderCircle, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import { LocaleSwitcher } from "./locale-switcher";

const inputClass = "min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-violet focus:bg-white";

export function RecoveryShell({ children }: { children: React.ReactNode }) {
  return <main id="main-content" className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-8 sm:px-6"><div className="dot-grid absolute inset-0 opacity-45" /><div className="absolute -left-28 -top-28 size-72 rounded-full bg-sky/70 blur-2xl" /><div className="absolute -bottom-32 -right-24 size-80 rounded-full bg-[#d9d3f5]/80 blur-2xl" /><section className="relative w-full max-w-lg rounded-[30px] border-2 border-ink bg-white p-6 shadow-[8px_9px_0_#242136] sm:p-9"><Link href="/practice" className="inline-flex items-center gap-2 font-display text-xl font-black"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link>{children}<div className="mt-6 flex justify-center"><LocaleSwitcher /></div></section></main>;
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-black">{label}</span><span className="relative block"><span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted">{icon}</span>{children}</span></label>;
}

export function ForgotPasswordForm() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await apiRequest("/api/auth/password-reset", { method: "POST", body: { email } });
      setSubmitted(true);
    } catch (cause) {
      setError(describeApiError(cause, t("recovery.sendResetFailed"), t));
    } finally {
      setBusy(false);
    }
  }

  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Account recovery</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">{t("recovery.forgotTitle")}</h1>{submitted ? <div role="status" className="mt-6 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">{t("recovery.checkEmail")}</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("recovery.resetSentBody")}</p><button type="button" onClick={() => { setSubmitted(false); setEmail(""); }} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-violet"><RotateCcw size={16} /> {t("recovery.reenterEmail")}</button></div> : <><p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("recovery.forgotLead")}</p><form onSubmit={submit} className="mt-6 space-y-4"><Field label={t("common.email")} icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{t("recovery.sendReset")} <ArrowRight size={18} /></>}</button></form></>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">{t("common.backToLogin")}</Link></p></RecoveryShell>;
}

export function ResetPasswordForm() {
  const t = useT();
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
      setError(t("recovery.passwordMismatch"));
      return;
    }
    setBusy(true); setError("");
    try {
      const body = await apiRequest<{ providersDisconnected?: number }>("/api/auth/password-reset", { method: "PATCH", body: { token, newPassword: password } });
      setProvidersDisconnected((body.providersDisconnected ?? 0) > 0);
      setChanged(true); setToken(""); setPassword(""); setConfirmation("");
    } catch (cause) {
      setError(describeApiError(cause, t("recovery.resetFailed"), t));
    } finally {
      setBusy(false);
    }
  }

  if (token === null) return <RecoveryShell><p role="status" className="mt-8 font-bold text-muted">{t("recovery.checkingResetLink")}</p></RecoveryShell>;
  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Choose a new password</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">{t("recovery.resetTitle")}</h1>{changed ? <div role="status" className="mt-6 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">{t("recovery.passwordUpdated")}</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("recovery.sessionsSignedOut")}{providersDisconnected ? t("recovery.providersRemovedReset") : ""}{t("recovery.signInWithNewPassword")}</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">{t("recovery.goToLogin")} <ArrowRight size={16} /></Link></div> : !token ? <div role="alert" className="mt-6 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-5"><p className="font-black text-coral">{t("recovery.resetLinkInvalid")}</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("recovery.resetLinkInvalidBody")}</p><Link href="/forgot-password" className="mt-4 inline-flex min-h-11 items-center gap-2 font-black text-violet">{t("recovery.requestNewLink")} <ArrowRight size={16} /></Link></div> : <><p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("recovery.resetLead")}</p><form onSubmit={submit} className="mt-6 space-y-4"><Field label={t("recovery.newPassword")} icon={<LockKeyhole size={18} />}><input type="password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} /></Field><Field label={t("recovery.confirmNewPassword")} icon={<LockKeyhole size={18} />}><input type="password" required minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{t("recovery.updatePassword")} <ArrowRight size={18} /></>}</button></form></>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">{t("common.backToLogin")}</Link></p></RecoveryShell>;
}

export function EmailVerificationForm() {
  const t = useT();
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
      const body = await apiRequest<{ providersDisconnected?: number }>("/api/auth/email-verification", { method: "PATCH", body: { token, password } });
      setProvidersDisconnected((body.providersDisconnected ?? 0) > 0);
      setVerified(true); setToken(""); setPassword("");
    } catch (cause) {
      setError(describeApiError(cause, t("recovery.verifyFailed"), t));
    } finally {
      setBusy(false);
    }
  }

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await apiRequest("/api/auth/email-verification", { method: "POST", body: { email } });
      setSent(true);
    } catch (cause) {
      setError(describeApiError(cause, t("recovery.resendFailed"), t));
    } finally {
      setBusy(false);
    }
  }

  if (token === null) return <RecoveryShell><p role="status" className="mt-8 flex items-center gap-2 font-bold text-muted"><LoaderCircle className="animate-spin" size={18} /> {t("recovery.readingVerificationLink")}</p></RecoveryShell>;
  if (verified) return <RecoveryShell><div role="status" className="mt-7 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><BadgeCheck className="text-[#557000]" /><h1 className="mt-3 font-display text-3xl font-black">{t("recovery.emailVerified")}</h1><p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("recovery.emailVerifiedBody")}{providersDisconnected ? t("recovery.providersRemovedVerify") : ""}</p><Link href="/login?verified=1" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">{t("recovery.goToLogin")} <ArrowRight size={16} /></Link></div></RecoveryShell>;

  return <RecoveryShell><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-coral">Verify your email</p><h1 className="mt-1.5 font-display text-3xl font-black tracking-tight">{t("recovery.verifyTitle")}</h1>{token ? <><p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("recovery.verifyLead")}</p><form onSubmit={verify} className="mt-6 space-y-4"><Field label={t("recovery.accountPassword")} icon={<LockKeyhole size={18} />}><input type="password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{t("recovery.confirmAndVerify")} <ArrowRight size={18} /></>}</button></form></> : <>{registered ? <div role="status" className="mt-5 rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">{t("recovery.registeredNotice")}</div> : passwordSet ? <div role="status" className="mt-5 rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">{t("recovery.passwordSetNotice")}{passwordVerificationScheduled ? t("recovery.passwordSetScheduled") : t("recovery.passwordSetUnconfigured")}</div> : <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("recovery.resendLead")}</p>}{sent ? <div role="status" className="mt-5 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><CheckCircle2 className="text-[#557000]" /><p className="mt-3 font-black">{t("recovery.checkEmail")}</p><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("recovery.resendSentBody")}</p><button type="button" onClick={() => { setSent(false); setEmail(""); }} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-violet"><RotateCcw size={16} /> {t("recovery.reenterEmail")}</button></div> : <form onSubmit={resend} className="mt-6 space-y-4"><Field label={t("recovery.loginEmail")} icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>{error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}<button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{t("recovery.resendVerification")} <ArrowRight size={18} /></>}</button></form>}</>}<p className="mt-6 text-center text-sm font-semibold text-muted"><Link href="/login" className="font-black text-violet hover:underline">{t("common.backToLogin")}</Link></p></RecoveryShell>;
}
