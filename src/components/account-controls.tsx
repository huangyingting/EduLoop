"use client";

import { Check, KeyRound, LoaderCircle, LogIn, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { resetDeviceKey } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function AccountControls() {
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (auth.status === "loading") return <div role="status" className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 text-sm font-bold text-muted">正在确认账号状态…</div>;
  if (auth.status === "guest") return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-black">账号安全</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">匿名访客没有账号凭据。登录后可在这里更改密码或完整删除账号。</p><Link href="/login?next=%2Fprivacy" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white"><LogIn size={17} /> 登录管理账号</Link></section>;

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
      setCurrentPassword(""); setNewPassword(""); setMessage("密码已更新，其他设备上的登录会话已退出。");
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
        body: JSON.stringify({ currentPassword: deletePassword }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "账号删除失败，请稍后再试。"));
      resetDeviceKey();
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "账号删除失败");
      setDeleting(false);
    }
  }

  return <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8">
    <h2 className="font-display text-2xl font-black">账号安全</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-muted">当前账号：{auth.user?.email}</p>
    {message ? <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]"><Check size={17} /> {message}</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form onSubmit={changePassword} className="rounded-2xl border-2 border-violet/15 bg-[#f0edff] p-5">
        <h3 className="flex items-center gap-2 font-black"><KeyRound size={18} /> 更改密码</h3>
        <label className="mt-4 block text-sm font-bold">当前密码<input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        <label className="mt-3 block text-sm font-bold">新密码<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-violet" /></label>
        <button disabled={changing} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{changing ? <LoaderCircle className="animate-spin" size={17} /> : <KeyRound size={17} />} 更新密码</button>
      </form>
      <form onSubmit={removeAccount} className="rounded-2xl border-2 border-coral/25 bg-[#fff0ed] p-5">
        <h3 className="flex items-center gap-2 font-black"><UserX size={18} /> 永久删除账号</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">删除邮箱账号、全部会话及关联学习数据。此操作不可恢复。</p>
        <label className="mt-4 block text-sm font-bold">输入当前密码确认<input type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-ink/10 bg-white px-3 outline-none focus:border-coral" /></label>
        <button disabled={deleting} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <UserX size={17} />} 删除账号与数据</button>
      </form>
    </div>
  </section>;
}
