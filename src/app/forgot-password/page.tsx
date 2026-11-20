import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/password-recovery-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.forgotTitle") };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
