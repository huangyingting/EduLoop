import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { registrationEnabled } from "@/lib/deployment-mode";

export const metadata: Metadata = { title: "注册", description: "创建 EduLoop 学习账号，保存答题记录、错题复习、连续学习天数与徽章。", alternates: { canonical: "/register" } };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (!registrationEnabled()) redirect("/login?registration=disabled");
  return <Suspense><AuthForm mode="register" /></Suspense>;
}
