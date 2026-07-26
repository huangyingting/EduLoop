import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: { default: "EduLoop · 每一题都有回响", template: "%s · EduLoop" },
  description: "面向中小学生的个性化学科练习平台。用小步练习、即时反馈和成长奖励，把知识练成能力。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
