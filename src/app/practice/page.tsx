import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticePlayer } from "@/components/practice/practice-player";

export const metadata: Metadata = {
  title: "专注练习",
  description: "无需注册即可开始 10 题挑战：数学、物理、化学、生物、语文与 AMC 竞赛题，提交后立即看到参考答案与解析。",
  alternates: { canonical: "/practice" },
};

export default function PracticePage() {
  return <Suspense fallback={<div className="p-10 font-bold text-muted">正在进入练习空间…</div>}><PracticePlayer /></Suspense>;
}
