import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { registrationEnabled } from "@/lib/deployment-mode";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.registerTitle"), description: t("pages.registerDescription"), alternates: { canonical: "/register" } };
}
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (!registrationEnabled()) redirect("/login?registration=disabled");
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
