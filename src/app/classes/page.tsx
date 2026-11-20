import type { Metadata } from "next";
import { LearnerClasses } from "@/components/classes/learner-classes";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("classes.metaTitle") };
}

export default function ClassesPage() {
  return <LearnerClasses />;
}
