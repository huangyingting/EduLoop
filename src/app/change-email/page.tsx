import type { Metadata } from "next";
import { EmailChangeForm } from "@/components/email-change-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.changeEmailTitle") };
}

export default function ChangeEmailPage() {
  return <EmailChangeForm />;
}
