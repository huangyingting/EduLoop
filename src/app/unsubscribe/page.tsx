import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeConfirmation } from "@/components/unsubscribe-confirmation";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("notifications.unsubscribeMetaTitle"), robots: { index: false } };
}

export default function UnsubscribePage() {
  return <Suspense fallback={null}><UnsubscribeConfirmation /></Suspense>;
}
