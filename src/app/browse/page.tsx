import type { Metadata } from "next";
import { Suspense } from "react";
import { QuestionBrowser } from "@/components/question-browser";

export const metadata: Metadata = { title: "题库浏览" };

export default function BrowsePage() {
  return <Suspense fallback={<div className="p-10 font-bold text-muted">正在打开题库…</div>}><QuestionBrowser /></Suspense>;
}
