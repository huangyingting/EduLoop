import type { Metadata } from "next";
import { ContentStudio } from "@/components/content-studio";

export const metadata: Metadata = {
  title: "内容审核台 · EduLoop",
  description: "审核学生提交的题目质量报告。",
};

export default function StudioPage() {
  return <ContentStudio />;
}
