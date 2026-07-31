"use client";

import { Download, LoaderCircle, LogIn, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  hasRecentAuthentication,
  SENSITIVE_ACTION_MAX_AGE_SECONDS,
} from "@/lib/auth-validation";
import { useAuth } from "@/lib/use-auth";

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function PrivacyControls() {
  const auth = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [exportError, setExportError] = useState("");
  const [authenticationCheckAt, setAuthenticationCheckAt] = useState(
    () => Math.floor(Date.now() / 1000),
  );
  const authenticatedAt = auth.user?.authenticatedAt ?? 0;
  const hasRecentLogin = auth.status === "authenticated"
    && hasRecentAuthentication(authenticatedAt, authenticationCheckAt);
  const needsRecentLogin = auth.status === "authenticated" && !hasRecentLogin;

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

  async function removeData() {
    if (!hasRecentLogin) return;
    if (!window.confirm("确定删除当前身份的全部学习记录吗？账号本身会保留，但此操作无法撤销。")) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch("/api/learner", { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response, "删除失败，请稍后再试。"));
      window.location.assign("/");
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "删除失败");
      setDeleting(false);
    }
  }

  async function exportData() {
    if (!hasRecentLogin) return;
    setExporting(true); setExportError("");
    try {
      const response = await fetch("/api/learner/export");
      if (!response.ok) throw new Error(await errorMessage(response, "导出失败，请稍后再试。"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eduloop-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function reauthenticate() {
    try {
      await auth.logout();
    } finally {
      window.location.assign("/login?next=%2Fprivacy");
    }
  }

  return <div className="mt-7">
    {auth.status === "loading"
      ? <p role="status" className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-bold text-muted">正在确认登录时间…</p>
      : auth.status === "guest"
        ? <div className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>请先登录，再下载完整账号资料或删除学习记录。</p><Link href="/login?next=%2Fprivacy" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> 登录管理数据</Link></div>
        : needsRecentLogin
          ? <div className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>导出完整资料或删除学习记录前，请重新登录验证当前账号。重新登录不要求接受新版条款。</p><button type="button" onClick={() => void reauthenticate()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> 重新登录验证</button></div>
          : null}
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <section className="rounded-[28px] border-2 border-violet/25 bg-[#f0edff] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">导出账号与学习数据</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">下载登录邮箱、同意记录、社交登录标识、会话到期时间、适用的内容审核操作，以及练习、活动、收藏、复习计划和徽章。文件不包含密码哈希、会话令牌或验证令牌摘要；系统不会持久保存提供商访问、刷新或身份令牌。为保护完整资料，下载前须在最近 10 分钟内完成登录验证。</p>
        {exportError ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{exportError}</p> : null}
        <button type="button" onClick={() => void exportData()} disabled={exporting || !hasRecentLogin} aria-busy={exporting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{exporting ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />} 下载 JSON</button>
      </section>
      <section className="rounded-[28px] border-2 border-coral/30 bg-[#fff0ed] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">删除学习数据</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">这会永久删除答题、会话、复习计划、收藏、徽章和成长统计。登录账号和题库内容不会受影响。删除前须在最近 10 分钟内完成登录验证，成功后会向登录邮箱发送安全通知。</p>
        {deleteError ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{deleteError}</p> : null}
        <button type="button" onClick={() => void removeData()} disabled={deleting || !hasRecentLogin} aria-busy={deleting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <Trash2 size={17} />} 删除我的学习记录</button>
      </section>
    </div>
  </div>;
}
