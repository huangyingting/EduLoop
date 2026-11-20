import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticePlayer } from "@/components/practice/practice-player";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.practiceTitle"), description: t("pages.practiceDescription"), alternates: { canonical: "/practice" } };
}

export default async function PracticePage() {
  const { t } = await getTranslator();
  return <Suspense fallback={<div className="p-10 font-bold text-muted">{t("pages.practiceLoading")}</div>}><PracticePlayer /></Suspense>;
}
