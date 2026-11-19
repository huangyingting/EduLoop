"use client";

import { ArrowRight, BookOpenCheck, GraduationCap, LoaderCircle, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { ApiClientError, apiRequest, describeApiError } from "@/lib/api-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeReturnPath } from "@/lib/auth-validation";
import type { ConsentBasis } from "@/lib/legal";
import {
  loadSocialProviders,
  requestProviderAuthorization,
  type SocialProvider,
} from "@/lib/social-providers";
import { useAuth } from "@/lib/use-auth";
import { CustomSelect } from "./custom-select";
import { LocaleSwitcher } from "./locale-switcher";

type GradeBandOption = { slug: string; name: string };

export function AuthForm({
  mode,
  registrationEnabled = true,
}: {
  mode: "login" | "register";
  registrationEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [knowledgeBand, setKnowledgeBand] = useState("");
  const [consentBasis, setConsentBasis] = useState<ConsentBasis | "">("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState(() => authErrorMessage(t, searchParams.get("error"), searchParams.get("code")));
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [providerLoadState, setProviderLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [providerReload, setProviderReload] = useState(0);
  const [gradeBands, setGradeBands] = useState<GradeBandOption[]>([]);
  const isLogin = mode === "login";
  const emailUnverified = isLogin && searchParams.get("code") === "email_not_verified";
  const emailVerified = isLogin && searchParams.get("verified") === "1";
  const providerDisconnected = isLogin && searchParams.get("notice") === "provider_disconnected";
  const sessionsRevoked = isLogin && searchParams.get("notice") === "sessions_revoked";
  const registrationDisabled = isLogin && searchParams.get("registration") === "disabled";
  const queryAuthError = searchParams.get("error");
  const queryAuthCode = searchParams.get("code");
  const authenticatedAuthError = auth.status === "authenticated" && queryAuthError
    ? authErrorMessage(t, queryAuthError, queryAuthCode, "account-link")
    : "";
  const next = safeReturnPath(searchParams.get("next"));

  useEffect(() => {
    if (auth.status !== "guest") return;
    let cancelled = false;
    void loadSocialProviders().then((available) => {
      if (cancelled) return;
      setProviders(available);
      setProviderLoadState("ready");
    }).catch(() => {
      if (cancelled) return;
      setProviders([]);
      setProviderLoadState("failed");
    });
    return () => { cancelled = true; };
  }, [auth.status, providerReload]);

  useEffect(() => {
    if (isLogin || auth.status !== "guest") return;
    void fetch("/api/catalog")
      .then((response) => response.ok ? response.json() as Promise<{ gradeBands: GradeBandOption[] }> : Promise.reject())
      .then((catalog) => setGradeBands(catalog.gradeBands))
      .catch(() => setGradeBands([]));
  }, [auth.status, isLogin]);

  useEffect(() => {
    if (auth.status !== "authenticated" || authenticatedAuthError) return;
    router.replace(auth.user?.hasCurrentConsent ? next : `/consent?next=${encodeURIComponent(next)}`);
  }, [auth.status, auth.user?.hasCurrentConsent, authenticatedAuthError, next, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!isLogin) {
        const body = await apiRequest<{ verificationRequired?: boolean }>("/api/auth/register", {
          method: "POST",
          body: {
            email,
            password,
            displayName: displayName.trim() || undefined,
            knowledgeBand: knowledgeBand || undefined,
            consentBasis,
            acceptedTerms,
          },
        });
        if (body.verificationRequired) {
          router.replace("/verify-email?registered=1");
          return;
        }
      }
      await signIn("credentials", {
        email,
        password,
        redirectTo: next,
      });
    } catch (cause) {
      setError(describeApiError(cause, cause instanceof ApiClientError ? t("auth.registerFailed") : t("auth.loginFailed"), t));
      setBusy(false);
    }
  }

  async function socialLogin(provider: SocialProvider) {
    if (socialBusy || busy) return;
    setSocialBusy(provider.id);
    setError("");
    try {
      const result = await requestProviderAuthorization(provider.id, next);
      if (!result.ok) {
        setError(authErrorMessage(t, result.error, result.code));
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError(t("auth.socialStartFailed"));
    } finally {
      setSocialBusy(null);
    }
  }

  const alternate = isLogin ? "/register" : "/login";
  const alternateHref = next === "/" ? alternate : `${alternate}?next=${encodeURIComponent(next)}`;

  if (authenticatedAuthError) {
    return <AuthenticatedProviderError message={authenticatedAuthError} />;
  }

  if (auth.status !== "guest") {
    return <main id="main-content" className="grid min-h-screen place-items-center bg-canvas p-6"><p role="status" className="font-bold text-muted">{auth.status === "authenticated" ? t("auth.returning") : t("auth.checking")}</p></main>;
  }

  return (
    <main id="main-content" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-6 sm:px-6">
      <div className="dot-grid absolute inset-0 opacity-45" />
      <div className="absolute -left-28 -top-28 size-72 rounded-full bg-sky/70 blur-2xl" />
      <div className="absolute -bottom-32 -right-24 size-80 rounded-full bg-[#d9d3f5]/80 blur-2xl" />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[30px] border-2 border-ink bg-white shadow-[8px_9px_0_#242136] lg:grid-cols-[.82fr_1.18fr]">
        <section className="relative hidden overflow-hidden bg-violet p-8 text-white lg:block">
          <div className="dot-grid absolute inset-0 opacity-20" />
          <div className="relative">
            <Link href="/practice" className="inline-flex items-center gap-2 font-display text-2xl font-black"><span className="grid size-10 place-items-center rounded-2xl bg-lime text-ink">∞</span>EduLoop</Link>
            <div className="mt-12 inline-flex -rotate-2 items-center gap-2 rounded-full border-2 border-ink bg-lime px-3 py-1.5 text-xs font-black text-ink shadow-[3px_3px_0_#242136]"><Sparkles size={14} /> {t("auth.asideBadge")}</div>
            <h1 className="mt-5 font-display text-3xl font-black leading-tight">{t("auth.asideTitleLine1")}<br />{t("auth.asideTitleLine2")}</h1>
            <ul className="mt-6 space-y-3 text-sm font-bold text-white/85">
              <li className="flex items-center gap-3"><BookOpenCheck className="text-lime" /> {t("auth.asideXp")}</li>
              <li className="flex items-center gap-3"><Sparkles className="text-lime" /> {t("auth.asideReview")}</li>
              <li className="flex items-center gap-3"><LockKeyhole className="text-lime" /> {t("auth.asideSecurity")}</li>
            </ul>
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:p-9">
          <Link href="/practice" className="inline-flex items-center gap-2 font-display text-xl font-black lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-coral lg:mt-0">{isLogin ? "Welcome back" : "Start your learning loop"}</p>
          <h2 className="mt-1.5 font-display text-[28px] font-black tracking-tight">{isLogin ? t("auth.loginTitle") : t("auth.registerTitle")}</h2>
          <p className="mt-1.5 text-sm font-semibold leading-5 text-muted">{isLogin ? t("auth.loginLead") : t("auth.registerLead")}</p>

          {providerLoadState === "failed" ? <div role="alert" className="mt-5 rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral"><p>{t("auth.socialUnavailable")}</p><button type="button" onClick={() => { setProviderLoadState("loading"); setProviderReload((value) => value + 1); }} className="mt-2 min-h-9 rounded-lg border-2 border-coral/30 px-3 text-xs font-black">{t("auth.socialRetry")}</button></div> : null}

          {providers.length ? <>
            <div className="mt-5 space-y-2">
              {providers.map((provider) => <button key={provider.id} type="button" disabled={Boolean(socialBusy) || busy} onClick={() => void socialLogin(provider)} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border-2 border-ink/10 bg-white px-5 text-sm font-black transition hover:border-violet/40 hover:bg-canvas disabled:opacity-60">
                {socialBusy === provider.id ? <LoaderCircle className="animate-spin" size={18} /> : <ProviderIcon id={provider.id} />}
                {t("auth.continueWith", { provider: providerLabel(provider) })}
              </button>)}
            </div>
            <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-ink/10" /><span className="text-xs font-black text-muted">{t("auth.orEmail")}</span><span className="h-px flex-1 bg-ink/10" /></div>
          </> : null}

          <form onSubmit={submit} className={`${providers.length ? "" : "mt-5"} space-y-3`}>
            {!isLogin ? <Field label={t("auth.nicknameOptional")} icon={<UserRound size={18} />}><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} autoComplete="name" placeholder={t("auth.nicknamePlaceholder")} className={inputClass} /></Field> : null}
            {!isLogin && gradeBands.length ? <div><span className="mb-1 block text-xs font-black">{t("auth.bandOptional")}</span><CustomSelect label={t("auth.bandLabel")} value={knowledgeBand} options={[{ value: "", label: t("auth.bandAll") }, ...gradeBands.map((band) => ({ value: band.slug, label: band.name }))]} onValueChange={setKnowledgeBand} leadingIcon={<GraduationCap size={18} />} className="w-full" /></div> : null}
            <Field label={t("common.email")} icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>
            <Field label={t("common.password")} icon={<LockKeyhole size={18} />}><input type="password" required minLength={isLogin ? undefined : 8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isLogin ? "current-password" : "new-password"} placeholder={isLogin ? t("auth.passwordPlaceholder") : t("auth.newPasswordPlaceholder")} className={inputClass} /></Field>
            {isLogin ? <p className="-mt-1 text-right text-xs font-semibold"><Link href="/forgot-password" className="font-black text-violet hover:underline">{t("auth.forgotPassword")}</Link></p> : null}
            {!isLogin ? <><fieldset><legend className="text-xs font-black">{t("auth.accountUser")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{([{ value: "ADULT", label: t("auth.basisAdult") }, { value: "GUARDIAN", label: t("auth.basisGuardian") }] as const).map((option) => <label key={option.value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-xs font-bold ${consentBasis === option.value ? "border-violet bg-[#f0edff]" : "border-ink/10"}`}><input type="radio" name="consentBasis" required value={option.value} checked={consentBasis === option.value} onChange={() => setConsentBasis(option.value)} className="accent-violet" />{option.label}</label>)}</div></fieldset><label className="flex items-start gap-2 text-xs font-semibold leading-5 text-muted"><input type="checkbox" required checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 shrink-0 accent-violet" /><span>{t("auth.acceptPrefix")} <Link href="/terms" target="_blank" className="font-black text-violet underline">{t("shell.terms")}</Link> {t("auth.acceptAnd")} <Link href="/privacy-policy" target="_blank" className="font-black text-violet underline">{t("shell.privacyPolicy")}</Link>{t("auth.acceptSuffix")}</span></label></> : null}

            {emailVerified ? <p role="status" className="rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">{t("auth.emailVerified")}</p> : null}
            {providerDisconnected ? <p role="status" className="rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">{t("auth.providerDisconnected")}</p> : null}
            {sessionsRevoked ? <p role="status" className="rounded-xl border-2 border-lime bg-[#f7fadf] px-4 py-3 text-sm font-bold text-[#557000]">{t("auth.sessionsRevoked")}</p> : null}
            {registrationDisabled ? <p role="status" className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-bold text-violet">{t("auth.registrationDisabled")}</p> : null}
            {error ? <div role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral"><p>{error}</p>{emailUnverified ? <Link href="/verify-email" className="mt-2 inline-block text-violet hover:underline">{t("auth.resendVerification")}</Link> : null}</div> : null}
            <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{isLogin ? t("auth.loginSubmit") : t("auth.registerSubmit")}<ArrowRight size={18} /></>}
            </button>
          </form>

          {isLogin && !registrationEnabled ? null : <p className="mt-4 text-center text-sm font-semibold text-muted">{isLogin ? t("auth.noAccount") : t("auth.haveAccount")} <Link href={alternateHref} className="font-black text-violet hover:underline">{isLogin ? t("common.register") : t("auth.signInInstead")}</Link></p>}
          <p className="mt-2.5 text-center text-xs font-semibold text-muted"><Link href="/practice" className="hover:text-ink hover:underline">{t("auth.guestPractice")}</Link></p>
          <p className="mt-2 text-center text-[11px] font-semibold text-muted"><Link href="/terms" className="hover:text-ink hover:underline">{t("shell.terms")}</Link> · <Link href="/privacy-policy" className="hover:text-ink hover:underline">{t("shell.privacyPolicy")}</Link></p>
          <div className="mt-2 flex justify-center"><LocaleSwitcher /></div>
        </section>
      </div>
    </main>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-violet focus:bg-white";

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-black">{label}</span><span className="relative block"><span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted">{icon}</span>{children}</span></label>;
}

function providerLabel(provider: SocialProvider) {
  if (provider.id === "microsoft-entra-id") return "Microsoft";
  return provider.name;
}

function ProviderIcon({ id }: { id: string }) {
  if (id === "google") return <span aria-hidden className="font-black text-[#4285f4]">G</span>;
  if (id === "microsoft-entra-id") return <span aria-hidden className="grid grid-cols-2 gap-px">{["#f25022", "#7fba00", "#00a4ef", "#ffb900"].map((color) => <span key={color} className="size-2" style={{ backgroundColor: color }} />)}</span>;
  if (id === "facebook") return <span aria-hidden className="grid size-5 place-items-center rounded-full bg-[#1877f2] text-sm font-black text-white">f</span>;
  return <UserRound aria-hidden size={18} />;
}

function AuthenticatedProviderError({ message }: { message: string }) {
  const t = useT();
  return <main id="main-content" className="grid min-h-screen place-items-center bg-canvas p-6"><section className="w-full max-w-lg rounded-[28px] border-2 border-ink bg-white p-7 shadow-[7px_8px_0_#242136]"><p className="text-xs font-black uppercase tracking-[.2em] text-coral">Account connection</p><h1 className="mt-2 font-display text-2xl font-black">{t("auth.linkErrorTitle")}</h1><p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-bold leading-6 text-coral">{message}</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/profile" className="inline-flex min-h-11 items-center rounded-xl bg-violet px-5 text-sm font-black text-white">{t("auth.backToAccount")}</Link><Link href="/practice" className="inline-flex min-h-11 items-center rounded-xl border-2 border-ink/10 px-5 text-sm font-black">{t("auth.continuePractice")}</Link></div></section></main>;
}
