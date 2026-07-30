"use client";

import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";

export function PrivacyControls() {
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function removeData() {
    if (!window.confirm("确定删除当前身份的全部学习记录吗？账号本身会保留，但此操作无法撤销。")) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch("/api/learner", { method: "DELETE" });
      if (!response.ok) throw new Error("删除失败，请稍后再试。");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
      setDeleting(false);
    }
  }

  async function exportData() {
    setExporting(true); setError("");
    try {
      const response = await fetch("/api/learner/export");
      if (!response.ok) throw new Error("导出失败，请稍后再试。");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eduloop-learning-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return <div className="mt-7 grid gap-5 sm:grid-cols-2"><section className="rounded-[28px] border-2 border-violet/25 bg-[#f0edff] p-6 sm:p-8"><h2 className="font-display text-2xl font-black">导出学习数据</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">下载账号中的练习、活动、收藏、复习计划和徽章记录。文件不包含邮箱、密码或会话信息。</p><button onClick={() => void exportData()} disabled={exporting} aria-busy={exporting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{exporting ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />} 下载 JSON</button></section><section className="rounded-[28px] border-2 border-coral/30 bg-[#fff0ed] p-6 sm:p-8"><h2 className="font-display text-2xl font-black">删除学习数据</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">这会删除答题、会话、复习计划、收藏、徽章和成长统计。登录账号和题库内容不会受影响。</p>{error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}<button onClick={() => void removeData()} disabled={deleting} aria-busy={deleting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <Trash2 size={17} />} 删除我的学习记录</button></section></div>;
}
