import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getCatalog(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const subjectSlug = params.get("subject") || null;
  const gradeBandSlug = params.get("gradeBand") || null;
  const gradeSlug = params.get("grade") || null;
  const selectedGradeScope: Prisma.QuestionWhereInput = {
    status: "PUBLISHED",
    ...(subjectSlug ? { subject: { slug: subjectSlug } } : {}),
  };
  const selectedSubjectScope: Prisma.QuestionWhereInput = {
    status: "PUBLISHED",
    ...(gradeBandSlug ? { gradeBand: { slug: gradeBandSlug } } : {}),
    ...(gradeSlug ? { grade: { slug: gradeSlug } } : {}),
  };
  const selectedTagScope: Prisma.QuestionWhereInput = {
    ...selectedSubjectScope,
    ...(subjectSlug ? { subject: { slug: subjectSlug } } : {}),
  };

  const [subjects, gradeBands, grades, tagDimensions] = await Promise.all([
    prisma.subject.findMany({
      where: { questions: { some: selectedSubjectScope } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }),
    prisma.gradeBand.findMany({
      where: { questions: { some: { status: "PUBLISHED" } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }),
    gradeBandSlug ? prisma.grade.findMany({
      where: {
        gradeBand: { slug: gradeBandSlug },
        questions: { some: selectedGradeScope },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }) : Promise.resolve([]),
    prisma.tagDimension.findMany({
      where: {
        isFilterable: true,
        tags: { some: { questions: { some: { question: selectedTagScope } } } },
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: {
        key: true,
        label: true,
        tags: {
          where: { questions: { some: { question: selectedTagScope } } },
          orderBy: { label: "asc" },
          select: { slug: true, label: true },
        },
      },
    }),
  ]);

  const topics = subjectSlug ? tagDimensions.find(({ key }) => key === "TOPIC")?.tags ?? [] : [];
  return NextResponse.json({ subjects, gradeBands, grades, tagDimensions, topics });
}

export const GET = apiHandler("GET /api/catalog", getCatalog);
