import type { Metadata } from "next";
import { ContestCatalog } from "@/components/contest/contest-catalog";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("contest.metaTitle") };
}

export default function ContestPage() {
  return <ContestCatalog />;
}
