import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsentForm } from "@/components/consent-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.consentTitle") };
}

export default function ConsentPage() {
  return <Suspense><ConsentForm /></Suspense>;
}
