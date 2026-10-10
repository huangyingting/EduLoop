import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { registrationEnabled } from "@/lib/deployment-mode";

export const metadata: Metadata = { title: "注册" };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (!registrationEnabled()) redirect("/login?registration=disabled");
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
