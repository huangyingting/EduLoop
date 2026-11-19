"use client";

import { BellOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { Key } from "@/i18n/messages";
import { apiRequest, describeApiError } from "@/lib/api-client";

const TYPE_LABELS: Record<string, Key> = { DUE_REVIEW_DIGEST: "notifications.typeDueReview", WEEKLY_SUMMARY: "notifications.typeWeekly" };

// Unsubscribing takes an explicit click, so link scanners that prefetch the
// URL cannot change anyone's preferences.
export function UnsubscribeConfirmation() {
  const t = useT();
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
      setError(describeApiError(cause, t("notifications.unsubscribeFailed"), t));
      setState("idle");
    }
  }

  return <div className="grid min-h-[70vh] place-items-center px-6 text-center"><div className="max-w-md">
    <BellOff className="mx-auto text-violet" size={42} />
    {state === "done"
      ? <><h1 className="mt-4 font-display text-2xl font-black">{t("notifications.unsubscribedTitle", { type: t(TYPE_LABELS[type] ?? "notifications.typeFallback") })}</h1><p className="mt-2 text-sm font-semibold text-muted">{t("notifications.unsubscribedBody")}</p></>
      : <><h1 className="mt-4 font-display text-2xl font-black">{t("notifications.unsubscribeTitle")}</h1><p className="mt-2 text-sm font-semibold text-muted">{t("notifications.unsubscribeBody")}</p>
        <button onClick={() => void confirm()} disabled={!token || state === "working"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-40">{state === "working" ? <LoaderCircle className="animate-spin" size={16} /> : null} {t("notifications.confirmUnsubscribe")}</button></>}
    {error ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
    <p className="mt-6"><Link href="/" className="text-sm font-black text-violet">{t("notifications.backToApp")}</Link></p>
  </div></div>;
}
