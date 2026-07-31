import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const querySchema = z.object({
  subject: slugSchema.optional(),
  gradeBand: slugSchema.optional(),
  grade: slugSchema.optional(),
}).strict();

async function getCatalog(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid catalog filters", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "catalog", "public", 180);
  if (limited) return limited;
  const subjectSlug = parsed.data.subject ?? null;
  const gradeBandSlug = parsed.data.gradeBand ?? null;
  const gradeSlug = parsed.data.grade ?? null;
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
  return NextResponse.json({ subjects, gradeBands, grades, tagDimensions, topics }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}

export const GET = apiHandler("GET /api/catalog", getCatalog);
