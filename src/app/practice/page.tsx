import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticePlayer } from "@/components/practice-player";

export const metadata: Metadata = { title: "专注练习" };

export default function PracticePage() {
  return <Suspense fallback={<div className="p-10 font-bold text-muted">正在进入练习空间…</div>}><PracticePlayer /></Suspense>;
}
