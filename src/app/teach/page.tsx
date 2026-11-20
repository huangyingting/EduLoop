import type { Metadata } from "next";
import { TeacherWorkspace } from "@/components/classes/teacher-workspace";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("teach.metaTitle") };
}

export default function TeachPage() {
  return <TeacherWorkspace />;
}
