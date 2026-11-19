import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailVerificationForm } from "@/components/password-recovery-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.verifyTitle") };
}

export default function VerifyEmailPage() {
  return <Suspense><EmailVerificationForm /></Suspense>;
}
