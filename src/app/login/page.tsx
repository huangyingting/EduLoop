import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { registrationEnabled } from "@/lib/deployment-mode";

export const metadata: Metadata = { title: "登录", description: "登录 EduLoop，继续你的练习、错题复习与成长记录。", alternates: { canonical: "/login" } };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <Suspense><AuthForm mode="login" registrationEnabled={registrationEnabled()} /></Suspense>;
}
