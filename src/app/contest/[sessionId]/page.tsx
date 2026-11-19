import type { Metadata } from "next";
import { ContestRunner } from "@/components/contest/contest-runner";

export const metadata: Metadata = { title: "竞赛模拟" };

export default async function ContestSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ContestRunner sessionId={sessionId} />;
}
