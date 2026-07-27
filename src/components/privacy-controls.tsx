"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { getDeviceKey, resetDeviceKey } from "@/lib/learner";

export function PrivacyControls() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function removeData() {
    if (!window.confirm("确定删除此设备对应的全部学习记录吗？此操作无法撤销。")) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/learner?deviceKey=${encodeURIComponent(getDeviceKey())}`, { method: "DELETE" });
      if (!response.ok) throw new Error("删除失败，请稍后再试。");
      resetDeviceKey();
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
      setDeleting(false);
    }
  }

  return <section className="mt-7 rounded-[28px] border-2 border-coral/30 bg-[#fff0ed] p-6 sm:p-8"><h2 className="font-display text-2xl font-black">删除学习数据</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">这会删除答题、会话、复习计划、收藏、徽章和成长统计。题库内容不会受影响。</p>{error ? <p className="mt-3 text-sm font-bold text-coral">{error}</p> : null}<button onClick={() => void removeData()} disabled={deleting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <Trash2 size={17} />} 删除我的学习记录</button></section>;
}
