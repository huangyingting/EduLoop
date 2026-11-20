import type { Metadata } from "next";
import { ReviewLibrary } from "@/components/review-library";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("review.metaTitle") };
}

export default function ReviewPage() {
  return <ReviewLibrary />;
}
