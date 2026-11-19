"use client";

import { BellRing, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import { EARLIEST_SEND_HOUR, LATEST_SEND_HOUR } from "@/lib/notifications/schedule";
import { useAuth } from "@/lib/use-auth";

type Preferences = { dueReviewDigest: boolean; weeklySummary: boolean; sendHour: number; emailVerified: boolean };

const HOURS = Array.from({ length: LATEST_SEND_HOUR - EARLIEST_SEND_HOUR + 1 }, (_, index) => EARLIEST_SEND_HOUR + index);

// Reminders are off by default; each type is a separate, explicit opt-in.
export function NotificationPreferencesForm() {
  const auth = useAuth();
  const t = useT();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const controller = new AbortController();
    apiRequest<Preferences>("/api/notifications/preferences", { signal: controller.signal })
      .then(setPreferences)
      .catch((cause) => { if (!controller.signal.aborted) setError(describeApiError(cause, t("notifications.loadFailed"), t)); });
    return () => controller.abort();
  }, [auth.status, t]);

  if (auth.status !== "authenticated" || !preferences) return null;

  async function save(next: Preferences) {
    setPreferences(next);
    setSaving(true); setMessage(""); setError("");
    try {
      setPreferences(await apiRequest<Preferences>("/api/notifications/preferences", {
        method: "PATCH",
        body: { dueReviewDigest: next.dueReviewDigest, weeklySummary: next.weeklySummary, sendHour: next.sendHour },
      }));
      setMessage(t("notifications.saved"));
    } catch (cause) {
      setError(describeApiError(cause, t("notifications.saveFailed"), t));
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="notification-preferences-title" className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-7">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-peach"><BellRing size={20} /></span><div><h2 id="notification-preferences-title" className="font-display text-xl font-black">{t("notifications.title")}</h2><p className="mt-1 text-sm font-semibold leading-6 text-muted">{t("notifications.body")}</p></div></div>
    {!preferences.emailVerified ? <p className="mt-4 rounded-xl bg-[#fff7dc] px-4 py-3 text-sm font-bold">{t("notifications.verifyFirst")}</p> : null}
    <div className="mt-5 space-y-3">
      <label className="flex items-center gap-3 text-sm font-black"><input type="checkbox" checked={preferences.dueReviewDigest} disabled={saving} onChange={(event) => void save({ ...preferences, dueReviewDigest: event.target.checked })} className="size-5" />{t("notifications.dueReview")}</label>
      <label className="flex items-center gap-3 text-sm font-black"><input type="checkbox" checked={preferences.weeklySummary} disabled={saving} onChange={(event) => void save({ ...preferences, weeklySummary: event.target.checked })} className="size-5" />{t("notifications.weekly")}</label>
      <label className="flex items-center gap-3 text-sm font-black">{t("notifications.sendTime")}
        <select value={preferences.sendHour} disabled={saving} onChange={(event) => void save({ ...preferences, sendHour: Number(event.target.value) })} className="min-h-10 rounded-lg border-2 border-ink/10 px-2 text-sm">
          {HOURS.map((hour) => <option key={hour} value={hour}>{t("notifications.afterHour", { hour })}</option>)}
        </select>
        {saving ? <LoaderCircle className="animate-spin text-violet" size={16} /> : null}
      </label>
    </div>
    {message ? <p role="status" className="mt-4 flex items-center gap-2 text-sm font-bold text-[#247a59]"><Check size={16} />{message}</p> : null}
    {error ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{error}</p> : null}
  </section>;
}
