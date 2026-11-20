import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cachedCatalogValue } from "@/lib/catalog-cache";
import { QUESTION_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";

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
  const limited = await enforceRateLimit(request, "catalog", { addressLimit: 180 });
  if (limited) return limited;
  const payload = await cachedCatalogValue(
    `catalog-filters:${parsed.data.subject ?? ""}:${parsed.data.gradeBand ?? ""}:${parsed.data.grade ?? ""}`,
    () => catalogFilters(parsed.data),
  );
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
  });
}

async function catalogFilters(query: z.infer<typeof querySchema>) {
  const subjectSlug = query.subject ?? null;
  const gradeBandSlug = query.gradeBand ?? null;
  const gradeSlug = query.grade ?? null;
  const selectedGradeScope: Prisma.QuestionWhereInput = {
    status: QUESTION_STATUS.PUBLISHED,
    ...(subjectSlug ? { subject: { slug: subjectSlug } } : {}),
  };
  const selectedSubjectScope: Prisma.QuestionWhereInput = {
    status: QUESTION_STATUS.PUBLISHED,
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
      where: { questions: { some: { status: QUESTION_STATUS.PUBLISHED } } },
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

  const topics = subjectSlug ? tagDimensions.find(({ key }) => key === TAG_DIMENSION.TOPIC)?.tags ?? [] : [];
  return { subjects, gradeBands, grades, tagDimensions, topics };
}

export const GET = apiHandler("GET /api/catalog", getCatalog);
