import type { Metadata } from "next";
import { ContestCatalog } from "@/components/contest/contest-catalog";

export const metadata: Metadata = { title: "竞赛模拟" };

export default function ContestPage() {
  return <ContestCatalog />;
}
