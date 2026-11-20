"use client";

import { Download, LoaderCircle, LogIn, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { apiErrorFromResponse, apiRequest, describeApiError } from "@/lib/api-client";
import {
  hasRecentAuthentication,
  SENSITIVE_ACTION_MAX_AGE_SECONDS,
} from "@/lib/auth-validation";
import { useAuth } from "@/lib/use-auth";

export function PrivacyControls() {
  const auth = useAuth();
  const t = useT();
  const router = useRouter();
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
    if (!window.confirm(t("privacyControls.confirmDelete"))) return;
    setDeleting(true); setDeleteError("");
    try {
      await apiRequest("/api/learner", { method: "DELETE" });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setDeleteError(describeApiError(cause, t("privacyControls.deleteFailed"), t));
      setDeleting(false);
    }
  }

  async function exportData() {
    if (!hasRecentLogin) return;
    setExporting(true); setExportError("");
    try {
      const response = await fetch("/api/learner/export");
      if (!response.ok) throw await apiErrorFromResponse(response);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eduloop-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(describeApiError(cause, t("privacyControls.exportFailed"), t));
    } finally {
      setExporting(false);
    }
  }

  async function reauthenticate() {
    try {
      await auth.logout();
    } finally {
      router.replace("/login?next=%2Fprivacy");
      router.refresh();
    }
  }

  return <div className="mt-7">
    {auth.status === "loading"
      ? <p role="status" className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-bold text-muted">{t("privacyControls.checking")}</p>
      : auth.status === "guest"
        ? <div className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>{t("privacyControls.guestBody")}</p><Link href="/login?next=%2Fprivacy" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> {t("privacyControls.guestSignIn")}</Link></div>
        : needsRecentLogin
          ? <div className="rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-semibold text-muted"><p>{t("privacyControls.reauthBody")}</p><button type="button" onClick={() => void reauthenticate()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet px-4 text-xs font-black text-white"><LogIn size={15} /> {t("account.reauthenticate")}</button></div>
          : null}
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <section className="rounded-[28px] border-2 border-violet/25 bg-[#f0edff] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">{t("privacyControls.exportTitle")}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("privacyControls.exportBody")}</p>
        {exportError ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{exportError}</p> : null}
        <button type="button" onClick={() => void exportData()} disabled={exporting || !hasRecentLogin} aria-busy={exporting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{exporting ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />} {t("privacyControls.download")}</button>
      </section>
      <section className="rounded-[28px] border-2 border-coral/30 bg-[#fff0ed] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">{t("privacyControls.deleteTitle")}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("privacyControls.deleteBody")}</p>
        {deleteError ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{deleteError}</p> : null}
        <button type="button" onClick={() => void removeData()} disabled={deleting || !hasRecentLogin} aria-busy={deleting} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-5 text-sm font-black text-white disabled:opacity-50">{deleting ? <LoaderCircle className="animate-spin" size={17} /> : <Trash2 size={17} />} {t("privacyControls.deleteSubmit")}</button>
      </section>
    </div>
  </div>;
}
