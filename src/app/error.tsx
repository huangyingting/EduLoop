"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useT } from "@/i18n/client";
import { errorLogMetadata, safeLogToken } from "@/lib/logging";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const digest = safeLogToken(error.digest);
  useEffect(() => {
    console.error(JSON.stringify({
      level: "error",
      event: "client_render_error",
      ...errorLogMetadata(error),
      digest,
    }));
  }, [digest, error]);

  return <div className="grid min-h-screen place-items-center p-6 text-center"><div className="max-w-md"><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[#fff0ed] text-coral"><CircleAlert size={32} /></span><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-coral">A small detour</p><h1 className="mt-2 font-display text-3xl font-black">{t("systemPages.errorTitle")}</h1><p className="mt-3 text-sm font-semibold leading-6 text-muted">{t("systemPages.errorBody")}</p><button onClick={reset} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white shadow-[0_4px_0_#6c5ce7]"><RotateCcw size={17} /> {t("systemPages.errorRetry")}</button>{digest ? <p className="mt-5 text-[11px] text-muted">{t("systemPages.errorDigest", { digest })}</p> : null}</div></div>;
}
