import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailVerificationForm } from "@/components/password-recovery-form";

export const metadata: Metadata = { title: "验证邮箱" };

export default function VerifyEmailPage() {
  return <Suspense><EmailVerificationForm /></Suspense>;
}
