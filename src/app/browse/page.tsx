import type { Metadata } from "next";
import { Suspense } from "react";
import { QuestionBrowser } from "@/components/question-browser";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("browse.metaTitle") };
}

export default async function BrowsePage() {
  const { t } = await getTranslator();
  return <Suspense fallback={<div className="p-10 font-bold text-muted">{t("pages.browseLoading")}</div>}><QuestionBrowser /></Suspense>;
}
