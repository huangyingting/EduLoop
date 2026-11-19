import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeConfirmation } from "@/components/unsubscribe-confirmation";

export const metadata: Metadata = { title: "退订学习提醒", robots: { index: false } };

export default function UnsubscribePage() {
  return <Suspense fallback={null}><UnsubscribeConfirmation /></Suspense>;
}
