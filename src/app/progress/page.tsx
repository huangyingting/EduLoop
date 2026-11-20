import type { Metadata } from "next";
import { ProgressDashboard } from "@/components/progress-dashboard";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("progress.metaTitle") };
}

export default function ProgressPage() {
  return <ProgressDashboard />;
}
