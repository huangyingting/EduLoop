import type { Metadata } from "next";
import { ContestRunner } from "@/components/contest/contest-runner";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("contest.metaTitle") };
}

export default async function ContestSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ContestRunner sessionId={sessionId} />;
}
