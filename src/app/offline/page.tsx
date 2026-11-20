import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("systemPages.offlineMetaTitle"), robots: { index: false } };
}

// Served by the service worker when a page cannot be reached. It is cached at
// install time, in the language active then, so it renders without a network.
export default async function OfflinePage() {
  const { t } = await getTranslator();
  return <div className="grid min-h-[70vh] place-items-center px-6 text-center"><div className="max-w-md">
    <WifiOff className="mx-auto text-violet" size={44} />
    <h1 className="mt-4 font-display text-2xl font-black">{t("systemPages.offlineTitle")}</h1>
    <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("systemPages.offlineBody")}</p>
  </div></div>;
}
