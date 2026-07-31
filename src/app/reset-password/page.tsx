import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/password-recovery-form";

export const metadata: Metadata = { title: "重置密码" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
