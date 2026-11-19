import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { registrationEnabled } from "@/lib/deployment-mode";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.loginTitle"), description: t("pages.loginDescription"), alternates: { canonical: "/login" } };
}
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <Suspense><AuthForm mode="login" registrationEnabled={registrationEnabled()} /></Suspense>;
}
