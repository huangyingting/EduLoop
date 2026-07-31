import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsentForm } from "@/components/consent-form";

export const metadata: Metadata = { title: "账号使用确认" };

export default function ConsentPage() {
  return <Suspense><ConsentForm /></Suspense>;
}
