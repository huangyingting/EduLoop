import type { Metadata } from "next";
import { ReviewLibrary } from "@/components/review-library";

export const metadata: Metadata = { title: "错题与收藏" };

export default function ReviewPage() {
  return <ReviewLibrary />;
}
