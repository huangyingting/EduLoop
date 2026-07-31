"use client";

import { Check, KeyRound, Link2, LoaderCircle, LogIn, Mail, UserX } from "lucide-react";
import Link from "next/link";
import { getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { hasRecentAuthentication } from "@/lib/auth-validation";
import { useAuth } from "@/lib/use-auth";

type SocialProvider = { id: string; name: string };

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
  const [linking, setLinking] = useState<string | null>(null);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasRecentLogin = auth.status === "authenticated"
    && hasRecentAuthentication(auth.user?.authenticatedAt ?? 0);
  const needsRecentSensitiveLogin = auth.status === "authenticated"
    && !auth.user?.hasPassword
    && !hasRecentLogin;
  const needsRecentProviderLogin = auth.status === "authenticated" && !hasRecentLogin;

  useEffect(() => {
    void getProviders().then((available) => {
      setProviders(Object.values(available ?? {})
        .filter((provider) => provider.type !== "credentials")
        .map(({ id, name }) => ({ id, name })));
    }).catch(() => setProviders([]));
  }, []);

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
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "密码修改失败，请稍后再试。"));
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
    if (linking || needsRecentProviderLogin) return;
    setLinking(provider.id); setError(""); setMessage("");
    try {
      await signIn(provider.id, { redirectTo: "/privacy" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法连接社交账号，请稍后重试。");
      setLinking(null);
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
    <p className="mt-2 text-sm font-semibold leading-6 text-muted">当前账号：{auth.user?.email}</p>
    {message ? <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]"><Check size={17} /> {message}</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    {needsRecentProviderLogin ? <div className="mt-4 rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>{needsRecentSensitiveLogin ? "更改邮箱、连接登录方式、设置密码或删除账号前，请重新验证你的社交账号。" : "连接新的登录方式前，请重新登录验证当前账号。"}</p><button type="button" onClick={() => void reauthenticate()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> 重新登录验证</button></div> : null}
    {providers.length ? <div className="mt-6 rounded-2xl border-2 border-sky/20 bg-[#eaf8ff] p-5">
      <h3 className="flex items-center gap-2 font-black"><Link2 size={18} /> 社交登录</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted">连接后可使用对应账号登录；连接操作会通过 Auth.js 重新验证提供商身份。</p>
      <div className="mt-4 flex flex-wrap gap-2">{providers.map((provider) => {
        const connected = auth.user?.oauthProviders.includes(provider.id);
        return <button key={provider.id} type="button" disabled={connected || Boolean(linking) || needsRecentProviderLogin} onClick={() => void linkProvider(provider)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-ink/10 bg-white px-4 text-sm font-black disabled:opacity-60">
          {linking === provider.id ? <LoaderCircle className="animate-spin" size={16} /> : connected ? <Check size={16} /> : <Link2 size={16} />}
          {provider.id === "microsoft-entra-id" ? "Microsoft" : provider.name}{connected ? "（已连接）" : ""}
        </button>;
      })}</div>
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
        {auth.user?.hasPassword ? <label className="mt-4 block text-sm font-bold">当前密码<input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label> : <p className="mt-3 text-sm font-semibold leading-6 text-muted">设置后可继续使用社交登录，也可直接使用邮箱和密码登录。</p>}
        <label className="mt-3 block text-sm font-bold">新密码<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        <button disabled={changing || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{changing ? <LoaderCircle className="animate-spin" size={17} /> : <KeyRound size={17} />} {auth.user?.hasPassword ? "更新密码" : "设置密码"}</button>
      </form>
      <form onSubmit={removeAccount} className="rounded-2xl border-2 border-coral/25 bg-[#fff0ed] p-5">
        <h3 className="flex items-center gap-2 font-black"><UserX size={18} /> 永久删除账号</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">删除邮箱账号、全部会话及关联学习数据。此操作不可恢复。</p>
        {auth.user?.hasPassword
          ? <label className="mt-4 block text-sm font-bold">输入当前密码确认<input type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>
          : <label className="mt-4 block text-sm font-bold">输入账号邮箱确认<input type="email" required autoComplete="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>}
        <button disabled={deleting || needsRecentSensitiveLogin} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <UserX size={17} />} 删除账号与数据</button>
      </form>
    </div>
  </section>;
}
