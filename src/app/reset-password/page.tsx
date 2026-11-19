import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/password-recovery-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.resetTitle") };
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
