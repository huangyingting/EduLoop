"use client";

import { BellOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiRequest, describeApiError } from "@/lib/api-client";

const TYPE_LABELS: Record<string, string> = { DUE_REVIEW_DIGEST: "错题复习提醒", WEEKLY_SUMMARY: "每周学习小结" };

// Unsubscribing takes an explicit click, so link scanners that prefetch the
// URL cannot change anyone's preferences.
export function UnsubscribeConfirmation() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  async function confirm() {
    setState("working"); setError("");
    try {
      const result = await apiRequest<{ type: string }>("/api/notifications/unsubscribe", { method: "POST", body: { token } });
      setType(result.type);
      setState("done");
    } catch (cause) {
      setError(describeApiError(cause, "退订链接无效或已过期，请登录后在“账号与学习档案”中关闭提醒。"));
      setState("idle");
    }
  }

  return <div className="grid min-h-[70vh] place-items-center px-6 text-center"><div className="max-w-md">
    <BellOff className="mx-auto text-violet" size={42} />
    {state === "done"
      ? <><h1 className="mt-4 font-display text-2xl font-black">已退订{TYPE_LABELS[type] ?? "提醒"}</h1><p className="mt-2 text-sm font-semibold text-muted">之后不会再收到这类邮件。你可以随时在账号设置中重新开启。</p></>
      : <><h1 className="mt-4 font-display text-2xl font-black">退订学习提醒</h1><p className="mt-2 text-sm font-semibold text-muted">确认后将停止发送这类提醒邮件。</p>
        <button onClick={() => void confirm()} disabled={!token || state === "working"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-40">{state === "working" ? <LoaderCircle className="animate-spin" size={16} /> : null} 确认退订</button></>}
    {error ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
    <p className="mt-6"><Link href="/" className="text-sm font-black text-violet">返回 EduLoop</Link></p>
  </div></div>;
}
