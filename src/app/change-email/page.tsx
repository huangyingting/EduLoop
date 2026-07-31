import type { Metadata } from "next";
import { EmailChangeForm } from "@/components/email-change-form";

export const metadata: Metadata = { title: "确认新邮箱" };

export default function ChangeEmailPage() {
  return <EmailChangeForm />;
}
