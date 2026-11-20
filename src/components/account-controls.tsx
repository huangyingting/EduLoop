"use client";

import { Check, KeyRound, Link2, LoaderCircle, LogIn, LogOut, Mail, Unlink, UserX } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import {
  hasRecentAuthentication,
  SENSITIVE_ACTION_MAX_AGE_SECONDS,
} from "@/lib/auth-validation";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  isSocialProviderId,
  loadSocialProviders,
  requestProviderAuthorization,
  socialProviderLabel,
  type SocialProvider,
} from "@/lib/social-providers";
import { useAuth } from "@/lib/use-auth";

export function AccountControls({ returnPath = "/profile" }: { returnPath?: string }) {
  const auth = useAuth();
  const t = useT();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [changing, setChanging] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [providerLoadState, setProviderLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [providerReload, setProviderReload] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authenticationCheckAt, setAuthenticationCheckAt] = useState(
    () => Math.floor(Date.now() / 1000),
  );
  const authenticatedAt = auth.user?.authenticatedAt ?? 0;
  const hasRecentLogin = auth.status === "authenticated"
    && hasRecentAuthentication(authenticatedAt, authenticationCheckAt);
  const needsRecentSensitiveLogin = auth.status === "authenticated"
    && !auth.user?.hasPassword
    && !hasRecentLogin;
  const needsRecentLogin = auth.status === "authenticated" && !hasRecentLogin;
  const hasVerifiedPassword = Boolean(auth.user?.hasPassword && auth.user.isEmailVerified);
  const connectedProviders = Array.from(new Set(
    (auth.user?.oauthProviders ?? []).filter(isSocialProviderId),
  ));
  const displayedProviders = [...providers];
  for (const provider of connectedProviders) {
    if (!displayedProviders.some(({ id }) => id === provider)) {
      displayedProviders.push({ id: provider, name: socialProviderLabel(provider) });
    }
  }

  useEffect(() => {
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
  }, [providerReload]);

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const currentTimeUpdate = window.setTimeout(() => {
      setAuthenticationCheckAt(Math.floor(Date.now() / 1000));
    }, 0);
    if (auth.status !== "authenticated" || !hasRecentAuthentication(authenticatedAt, now)) {
      return () => window.clearTimeout(currentTimeUpdate);
    }

    const expiresAt = authenticatedAt + SENSITIVE_ACTION_MAX_AGE_SECONDS + 1;
    const expirationUpdate = window.setTimeout(() => {
      setAuthenticationCheckAt(Math.floor(Date.now() / 1000));
    }, Math.max(0, expiresAt * 1000 - Date.now()));
    return () => {
      window.clearTimeout(currentTimeUpdate);
      window.clearTimeout(expirationUpdate);
    };
  }, [auth.status, authenticatedAt]);

  if (auth.status === "loading") return <div role="status" className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 text-sm font-bold text-muted">{t("account.checking")}</div>;
  if (auth.status === "guest") return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-black">{t("account.title")}</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.guestBody")}</p><Link href="/login?next=%2Fprivacy" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white"><LogIn size={17} /> {t("account.guestSignIn")}</Link></section>;

  async function changeEmail(event: React.FormEvent) {
    event.preventDefault();
    if (changingEmail) return;
    setChangingEmail(true); setError(""); setMessage("");
    try {
      await apiRequest("/api/auth/email-change", { method: "POST", body: { newEmail, currentPassword: emailPassword || undefined } });
      setNewEmail(""); setEmailPassword("");
      setMessage(t("account.emailChangeSent"));
    } catch (cause) {
      setError(describeApiError(cause, t("account.emailChangeFailed"), t));
    } finally {
      setChangingEmail(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (changing) return;
    setError(""); setMessage("");
    if (newPassword !== confirmPassword) {
      setError(t("account.passwordMismatch"));
      return;
    }
    setChanging(true);
    try {
      const body = await apiRequest<{ verificationRequired?: boolean; verificationScheduled?: boolean }>("/api/auth/account", {
        method: "PATCH",
        body: { currentPassword: currentPassword || undefined, newPassword },
      });
      if (body.verificationRequired) {
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
        try {
          await auth.logout();
        } finally {
          const delivery = body.verificationScheduled ? "&delivery=scheduled" : "";
          router.replace(`/verify-email?passwordSet=1${delivery}`);
          router.refresh();
        }
        return;
      }
      const signedIn = await signIn("credentials", {
        email: auth.user?.email,
        password: newPassword,
        redirect: false,
      });
      if (!signedIn.ok) {
        setError(t("account.passwordChangedSignInAgain"));
        return;
      }
      await auth.refresh();
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage(auth.user?.hasPassword ? t("account.passwordUpdated") : t("account.passwordSet"));
    } catch (cause) {
      setError(describeApiError(cause, t("account.passwordChangeFailed"), t));
    } finally {
      setChanging(false);
    }
  }

  async function removeAccount(event: React.FormEvent) {
    event.preventDefault();
    if (deleting || !window.confirm(t("account.confirmDelete"))) return;
    setDeleting(true); setError(""); setMessage("");
    try {
      await apiRequest("/api/auth/account", {
        method: "DELETE",
        body: auth.user?.hasPassword ? { currentPassword: deletePassword } : { emailConfirmation: deleteEmail },
      });
      try {
        await auth.logout();
      } finally {
        router.replace("/practice");
        router.refresh();
      }
    } catch (cause) {
      setError(describeApiError(cause, t("account.deleteFailed"), t));
      setDeleting(false);
    }
  }

  async function linkProvider(provider: SocialProvider) {
    if (linking || disconnecting || needsRecentLogin) return;
    setLinking(provider.id); setError(""); setMessage("");
    try {
      const result = await requestProviderAuthorization(provider.id, returnPath);
      if (!result.ok) {
        setError(authErrorMessage(t, result.error, result.code, "account-link"));
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError(t("account.linkFailed"));
    } finally {
      setLinking(null);
    }
  }

  async function disconnectProvider(provider: SocialProvider) {
    if (linking || disconnecting || needsRecentLogin) return;
    const label = socialProviderLabel(provider.id);
    if (!window.confirm(t("account.confirmDisconnect", { provider: label }))) return;
    setDisconnecting(provider.id); setError(""); setMessage("");
    try {
      await apiRequest("/api/auth/provider", { method: "DELETE", body: { provider: provider.id } });
      try {
        await auth.logout();
      } finally {
        router.replace(`/login?next=${encodeURIComponent(returnPath)}&notice=provider_disconnected`);
        router.refresh();
      }
    } catch (cause) {
      setError(describeApiError(cause, t("account.disconnectFailed"), t));
      setDisconnecting(null);
    }
  }

  async function revokeSessions() {
    if (
      revokingSessions
      || needsRecentLogin
      || !window.confirm(t("account.confirmRevoke"))
    ) return;
    setRevokingSessions(true); setError(""); setMessage("");
    try {
      await apiRequest("/api/auth/sessions", { method: "DELETE" });
      try {
        await auth.logout();
      } finally {
        router.replace(`/login?next=${encodeURIComponent(returnPath)}&notice=sessions_revoked`);
        router.refresh();
      }
    } catch (cause) {
      setError(describeApiError(cause, t("account.revokeFailed"), t));
      setRevokingSessions(false);
    }
  }

  async function reauthenticate() {
    try {
      await auth.logout();
    } finally {
      router.replace(`/login?next=${encodeURIComponent(returnPath)}`);
      router.refresh();
    }
  }

  return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8">
    <h2 className="font-display text-2xl font-black">{t("account.title")}</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.currentAccount", { email: auth.user?.email ?? "", status: auth.user?.isEmailVerified ? t("account.emailVerified") : t("account.emailUnverified") })}</p>
    {!auth.user?.isEmailVerified ? <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.unverifiedSocialPrefix")}{auth.user?.hasPassword ? t("account.unverifiedWithPassword") : t("account.unverifiedWithoutPassword")}{auth.user?.hasPassword ? <Link href="/verify-email" className="ml-1 font-black text-violet hover:underline">{t("account.resendVerification")}</Link> : null}</p> : null}
    {message ? <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]"><Check size={17} /> {message}</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    {providerLoadState === "failed" ? <div role="alert" className="mt-4 rounded-xl border-2 border-coral/25 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral"><p>{t("account.providersLoadFailed")}</p><button type="button" onClick={() => { setProviderLoadState("loading"); setProviderReload((value) => value + 1); }} className="mt-2 min-h-9 rounded-lg border-2 border-coral/30 px-3 text-xs font-black">{t("account.reloadProviders")}</button></div> : null}
    {needsRecentLogin ? <div className="mt-4 rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>{needsRecentSensitiveLogin ? t("account.reauthSensitive") : t("account.reauthProviders")}</p><button type="button" onClick={() => void reauthenticate()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> {t("account.reauthenticate")}</button></div> : null}
    {displayedProviders.length ? <div className="mt-6 rounded-2xl border-2 border-sky/20 bg-[#eaf8ff] p-5">
      <h3 className="flex items-center gap-2 font-black"><Link2 size={18} /> {t("account.socialTitle")}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.socialBody")}</p>
      <div className="mt-4 space-y-2">{displayedProviders.map((provider) => {
        const connected = connectedProviders.includes(provider.id);
        const canDisconnect = hasVerifiedPassword || connectedProviders.length > 1;
        const busy = linking === provider.id || disconnecting === provider.id;
        const label = socialProviderLabel(provider.id);
        return <div key={provider.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-ink/10 bg-white px-4 py-2">
          <span className="flex items-center gap-2 text-sm font-black">{connected ? <Check size={16} className="text-[#247a59]" /> : <Link2 size={16} />} {label}{connected ? t("account.connected") : ""}</span>
          <button
            type="button"
            disabled={Boolean(linking) || Boolean(disconnecting) || needsRecentLogin || (connected && !canDisconnect)}
            onClick={() => void (connected ? disconnectProvider(provider) : linkProvider(provider))}
            title={connected && !canDisconnect ? t("account.lastMethodTitle") : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-black disabled:opacity-50 ${connected ? "border-2 border-coral/30 text-coral" : "bg-violet text-white"}`}
          >
            {busy ? <LoaderCircle className="animate-spin" size={15} /> : connected ? <Unlink size={15} /> : <Link2 size={15} />}
            {connected ? t("account.disconnect", { provider: label }) : t("account.connect", { provider: label })}
          </button>
        </div>;
      })}</div>
      {!hasVerifiedPassword && connectedProviders.length === 1 ? <p className="mt-3 text-xs font-semibold leading-5 text-muted">{t("account.lastMethodBody")}</p> : null}
    </div> : null}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form onSubmit={changeEmail} className="rounded-2xl border-2 border-sky/25 bg-[#eaf8ff] p-5">
        <h3 className="flex items-center gap-2 font-black"><Mail size={18} /> {t("account.changeEmailTitle")}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.changeEmailBody")}</p>
        <label className="mt-4 block text-sm font-bold">{t("account.newEmail")}<input type="email" required maxLength={254} autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        {auth.user?.hasPassword ? <label className="mt-3 block text-sm font-bold">{t("account.confirmCurrentPassword")}<input type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label> : <p className="mt-3 text-sm font-semibold leading-6 text-muted">{t("account.socialReauthWindow")}</p>}
        <button disabled={changingEmail || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-50">{changingEmail ? <LoaderCircle className="animate-spin" size={17} /> : <Mail size={17} />} {t("account.sendEmailChange")}</button>
      </form>
      <form onSubmit={changePassword} className="rounded-2xl border-2 border-violet/15 bg-[#f0edff] p-5">
        <h3 className="flex items-center gap-2 font-black"><KeyRound size={18} /> {auth.user?.hasPassword ? t("account.changePasswordTitle") : t("account.setPasswordTitle")}</h3>
        {auth.user?.hasPassword ? <label className="mt-4 block text-sm font-bold">{t("account.currentPassword")}<input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label> : <p className="mt-3 text-sm font-semibold leading-6 text-muted">{auth.user?.isEmailVerified ? t("account.setPasswordVerified") : t("account.setPasswordUnverified")}</p>}
        <label className="mt-3 block text-sm font-bold">{t("account.newPassword")}<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        <label className="mt-3 block text-sm font-bold">{t("account.confirmNewPassword")}<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        <button disabled={changing || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{changing ? <LoaderCircle className="animate-spin" size={17} /> : <KeyRound size={17} />} {auth.user?.hasPassword ? t("account.updatePassword") : t("account.setPassword")}</button>
      </form>
      <div className="rounded-2xl border-2 border-amber-300/60 bg-amber-50 p-5">
        <h3 className="flex items-center gap-2 font-black"><LogOut size={18} /> {t("account.revokeTitle")}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.revokeBody")}</p>
        <button type="button" onClick={() => void revokeSessions()} disabled={revokingSessions || !hasRecentLogin} aria-busy={revokingSessions} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-50">{revokingSessions ? <LoaderCircle className="animate-spin" size={17} /> : <LogOut size={17} />} {t("account.revokeTitle")}</button>
      </div>
      <form onSubmit={removeAccount} className="rounded-2xl border-2 border-coral/25 bg-[#fff0ed] p-5">
        <h3 className="flex items-center gap-2 font-black"><UserX size={18} /> {t("account.deleteTitle")}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("account.deleteBody")}</p>
        {auth.user?.hasPassword
          ? <label className="mt-4 block text-sm font-bold">{t("account.deletePasswordConfirm")}<input type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>
          : <label className="mt-4 block text-sm font-bold">{t("account.deleteEmailConfirm")}<input type="email" required autoComplete="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>}
        <button disabled={deleting || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <UserX size={17} />} {t("account.deleteSubmit")}</button>
      </form>
    </div>
  </section>;
}
