import type { Metadata } from "next";
import { ProgressDashboard } from "@/components/progress-dashboard";

export const metadata: Metadata = { title: "我的成长" };

export default function ProgressPage() {
  return <ProgressDashboard />;
}
