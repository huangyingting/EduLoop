"use client";

import { Check, KeyRound, Link2, LoaderCircle, LogIn, LogOut, Mail, Unlink, UserX } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
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

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function AccountControls() {
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
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

  if (auth.status === "loading") return <div role="status" className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 text-sm font-bold text-muted">正在确认账号状态…</div>;
  if (auth.status === "guest") return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-black">账号安全</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">匿名访客没有账号凭据。登录后可在这里更改登录邮箱、密码或完整删除账号。</p><Link href="/login?next=%2Fprivacy" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white"><LogIn size={17} /> 登录管理账号</Link></section>;

  async function changeEmail(event: React.FormEvent) {
    event.preventDefault();
    if (changingEmail) return;
    setChangingEmail(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword: emailPassword || undefined }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "暂时无法发送新邮箱确认邮件，请稍后再试。"));
      setNewEmail(""); setEmailPassword("");
      setMessage("确认邮件已发送。打开新邮箱中的链接后，登录邮箱才会改变，所有旧会话会退出。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法发送新邮箱确认邮件");
    } finally {
      setChangingEmail(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (changing) return;
    setChanging(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
      });
      const body = await response.json().catch(() => null) as {
        error?: string;
        verificationRequired?: boolean;
        verificationScheduled?: boolean;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? "密码修改失败，请稍后再试。");
      if (body?.verificationRequired) {
        setCurrentPassword(""); setNewPassword("");
        try {
          await auth.logout();
        } finally {
          const delivery = body.verificationScheduled ? "&delivery=scheduled" : "";
          window.location.assign(`/verify-email?passwordSet=1${delivery}`);
        }
        return;
      }
      const signedIn = await signIn("credentials", {
        email: auth.user?.email,
        password: newPassword,
        redirect: false,
      });
      if (!signedIn.ok) throw new Error("密码已更新，请使用新密码重新登录。");
      await auth.refresh();
      setCurrentPassword(""); setNewPassword("");
      setMessage(auth.user?.hasPassword ? "密码已更新，其他设备上的登录会话已退出。" : "密码已设置，现在也可以使用邮箱登录。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "密码修改失败");
    } finally {
      setChanging(false);
    }
  }

  async function removeAccount(event: React.FormEvent) {
    event.preventDefault();
    if (deleting || !window.confirm("确定永久删除账号及全部学习数据吗？此操作无法撤销。")) return;
    setDeleting(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth.user?.hasPassword
          ? { currentPassword: deletePassword }
          : { emailConfirmation: deleteEmail }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "账号删除失败，请稍后再试。"));
      try {
        await auth.logout();
      } finally {
        window.location.assign("/practice");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "账号删除失败");
      setDeleting(false);
    }
  }

  async function linkProvider(provider: SocialProvider) {
    if (linking || disconnecting || needsRecentLogin) return;
    setLinking(provider.id); setError(""); setMessage("");
    try {
      const result = await requestProviderAuthorization(provider.id, "/privacy");
      if (!result.ok) {
        setError(authErrorMessage(result.error, result.code, "account-link"));
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("暂时无法连接社交账号，请稍后重试。");
    } finally {
      setLinking(null);
    }
  }

  async function disconnectProvider(provider: SocialProvider) {
    if (linking || disconnecting || needsRecentLogin) return;
    const label = socialProviderLabel(provider.id);
    if (!window.confirm(`确定移除 ${label} 登录连接吗？所有设备都会退出登录，你需要使用剩余方式重新登录。`)) return;
    setDisconnecting(provider.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/provider", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "暂时无法移除登录方式，请稍后重试。"));
      try {
        await auth.logout();
      } finally {
        window.location.assign("/login?next=%2Fprivacy&notice=provider_disconnected");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法移除登录方式");
      setDisconnecting(null);
    }
  }

  async function revokeSessions() {
    if (
      revokingSessions
      || needsRecentLogin
      || !window.confirm("确定退出当前设备及其他所有设备上的 EduLoop 登录吗？你需要重新登录才能继续。")
    ) return;
    setRevokingSessions(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/sessions", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "暂时无法退出所有设备，请稍后重试。"));
      }
      try {
        await auth.logout();
      } finally {
        window.location.assign("/login?next=%2Fprivacy&notice=sessions_revoked");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法退出所有设备");
      setRevokingSessions(false);
    }
  }

  async function reauthenticate() {
    try {
      await auth.logout();
    } finally {
      window.location.assign("/login?next=%2Fprivacy");
    }
  }

  return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8">
    <h2 className="font-display text-2xl font-black">账号安全</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-muted">当前账号：{auth.user?.email}（{auth.user?.isEmailVerified ? "邮箱已验证" : "邮箱未验证"}）</p>
    {!auth.user?.isEmailVerified ? <p className="mt-2 text-sm font-semibold leading-6 text-muted">社交登录仍可使用；{auth.user?.hasPassword ? "打开验证邮件并再次输入密码后，才能使用邮箱登录。为确认邮箱归属，验证时会移除当前社交登录连接，之后可重新连接。" : "若要启用邮箱登录，请先设置密码，再通过发送到该邮箱的链接确认。"}{auth.user?.hasPassword ? <Link href="/verify-email" className="ml-1 font-black text-violet hover:underline">重新发送验证邮件</Link> : null}</p> : null}
    {message ? <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]"><Check size={17} /> {message}</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    {providerLoadState === "failed" ? <div role="alert" className="mt-4 rounded-xl border-2 border-coral/25 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral"><p>暂时无法加载可连接的社交登录方式。已连接的方式和其他账号安全功能仍可使用。</p><button type="button" onClick={() => { setProviderLoadState("loading"); setProviderReload((value) => value + 1); }} className="mt-2 min-h-9 rounded-lg border-2 border-coral/30 px-3 text-xs font-black">重新加载登录方式</button></div> : null}
    {needsRecentLogin ? <div className="mt-4 rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>{needsRecentSensitiveLogin ? "更改邮箱、连接或移除登录方式、设置密码、退出所有设备或删除账号前，请重新验证你的社交账号。" : "连接或移除登录方式或退出所有设备前，请重新登录验证当前账号。"}</p><button type="button" onClick={() => void reauthenticate()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> 重新登录验证</button></div> : null}
    {displayedProviders.length ? <div className="mt-6 rounded-2xl border-2 border-sky/20 bg-[#eaf8ff] p-5">
      <h3 className="flex items-center gap-2 font-black"><Link2 size={18} /> 社交登录</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted">连接会重新验证提供商身份，只保存后续登录所需的账号关联，不保存访问或刷新令牌。移除连接会删除该关联并退出所有设备；系统不会允许删除最后一种登录方式。</p>
      <div className="mt-4 space-y-2">{displayedProviders.map((provider) => {
        const connected = connectedProviders.includes(provider.id);
        const canDisconnect = hasVerifiedPassword || connectedProviders.length > 1;
        const busy = linking === provider.id || disconnecting === provider.id;
        const label = socialProviderLabel(provider.id);
        return <div key={provider.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-ink/10 bg-white px-4 py-2">
          <span className="flex items-center gap-2 text-sm font-black">{connected ? <Check size={16} className="text-[#247a59]" /> : <Link2 size={16} />} {label}{connected ? "（已连接）" : ""}</span>
          <button
            type="button"
            disabled={Boolean(linking) || Boolean(disconnecting) || needsRecentLogin || (connected && !canDisconnect)}
            onClick={() => void (connected ? disconnectProvider(provider) : linkProvider(provider))}
            title={connected && !canDisconnect ? "请先设置密码或连接其他登录方式" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-black disabled:opacity-50 ${connected ? "border-2 border-coral/30 text-coral" : "bg-violet text-white"}`}
          >
            {busy ? <LoaderCircle className="animate-spin" size={15} /> : connected ? <Unlink size={15} /> : <Link2 size={15} />}
            {connected ? `断开 ${label}` : `连接 ${label}`}
          </button>
        </div>;
      })}</div>
      {!hasVerifiedPassword && connectedProviders.length === 1 ? <p className="mt-3 text-xs font-semibold leading-5 text-muted">这是当前唯一可用的登录方式。请先设置密码并验证邮箱，或连接另一个社交账号，再移除它。</p> : null}
    </div> : null}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form onSubmit={changeEmail} className="rounded-2xl border-2 border-sky/25 bg-[#eaf8ff] p-5">
        <h3 className="flex items-center gap-2 font-black"><Mail size={18} /> 更改登录邮箱</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">先验证新地址，再更新登录邮箱并退出所有旧会话。当前邮箱在确认前保持有效。</p>
        <label className="mt-4 block text-sm font-bold">新登录邮箱<input type="email" required maxLength={254} autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        {auth.user?.hasPassword ? <label className="mt-3 block text-sm font-bold">当前密码确认<input type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label> : <p className="mt-3 text-sm font-semibold leading-6 text-muted">社交登录账号需要在最近 10 分钟内重新验证身份。</p>}
        <button disabled={changingEmail || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-50">{changingEmail ? <LoaderCircle className="animate-spin" size={17} /> : <Mail size={17} />} 发送新邮箱确认</button>
      </form>
      <form onSubmit={changePassword} className="rounded-2xl border-2 border-violet/15 bg-[#f0edff] p-5">
        <h3 className="flex items-center gap-2 font-black"><KeyRound size={18} /> {auth.user?.hasPassword ? "更改密码" : "设置邮箱密码"}</h3>
        {auth.user?.hasPassword ? <label className="mt-4 block text-sm font-bold">当前密码<input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label> : <p className="mt-3 text-sm font-semibold leading-6 text-muted">{auth.user?.isEmailVerified ? "设置后可继续使用社交登录，也可直接使用邮箱和密码登录。" : "设置后会退出所有设备并发送邮箱验证链接；你需要在验证页再次输入这个密码。确认邮箱归属时会移除当前社交登录连接，之后可重新连接。"}</p>}
        <label className="mt-3 block text-sm font-bold">新密码<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        <button disabled={changing || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{changing ? <LoaderCircle className="animate-spin" size={17} /> : <KeyRound size={17} />} {auth.user?.hasPassword ? "更新密码" : "设置密码"}</button>
      </form>
      <div className="rounded-2xl border-2 border-amber-300/60 bg-amber-50 p-5">
        <h3 className="flex items-center gap-2 font-black"><LogOut size={18} /> 退出所有设备</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">立即使当前浏览器和其他所有设备上的登录会话失效。密码、登录邮箱、社交登录连接和学习数据都不会改变；操作成功后会向登录邮箱发送安全通知。</p>
        <button type="button" onClick={() => void revokeSessions()} disabled={revokingSessions || !hasRecentLogin} aria-busy={revokingSessions} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-50">{revokingSessions ? <LoaderCircle className="animate-spin" size={17} /> : <LogOut size={17} />} 退出所有设备</button>
      </div>
      <form onSubmit={removeAccount} className="rounded-2xl border-2 border-coral/25 bg-[#fff0ed] p-5">
        <h3 className="flex items-center gap-2 font-black"><UserX size={18} /> 永久删除账号</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">删除邮箱账号、全部会话及关联学习数据。题目反馈中的身份关联和自由文本会清除；不含报告人身份的安全审核状态与操作记录会随题库保留。此操作不可恢复。</p>
        {auth.user?.hasPassword
          ? <label className="mt-4 block text-sm font-bold">输入当前密码确认<input type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>
          : <label className="mt-4 block text-sm font-bold">输入账号邮箱确认<input type="email" required autoComplete="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>}
        <button disabled={deleting || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <UserX size={17} />} 删除账号与数据</button>
      </form>
    </div>
  </section>;
}
