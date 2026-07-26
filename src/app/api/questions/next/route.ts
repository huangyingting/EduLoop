import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { QUESTION_TYPE_LABELS } from "@/lib/content";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const excluded = (params.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 20);
  const tagSlugs = (params.get("tags") ?? "").split(",").filter(Boolean).slice(0, 8);
  const baseWhere: Prisma.QuestionWhereInput = {
    status: "PUBLISHED",
    ...(params.get("subject") ? { subject: { slug: params.get("subject")! } } : {}),
    ...(params.get("gradeBand") ? { gradeBand: { slug: params.get("gradeBand")! } } : {}),
    ...(params.get("grade") ? { grade: { slug: params.get("grade")! } } : {}),
    ...(params.get("difficulty") ? { difficulty: params.get("difficulty")! } : {}),
    ...(params.get("type") ? { type: params.get("type")! } : {}),
    ...(params.get("autoGradable") === "true" ? { isAutoGradable: true } : {}),
    ...(tagSlugs.length ? { tags: { some: { tag: { slug: { in: tagSlugs } } } } } : {}),
  };
  let where: Prisma.QuestionWhereInput = excluded.length ? { ...baseWhere, id: { notIn: excluded } } : baseWhere;
  let count = await prisma.question.count({ where });
  if (!count && excluded.length) {
    where = baseWhere;
    count = await prisma.question.count({ where });
  }
  if (!count) return NextResponse.json({ error: "No matching questions" }, { status: 404 });
  const question = await prisma.question.findFirst({
    where, skip: Math.floor(Math.random() * count),
    include: { subject: { select: { name: true, slug: true, color: true } }, grade: { select: { name: true } }, options: { orderBy: { sortOrder: "asc" } }, tags: { include: { tag: { include: { dimension: true } } } } },
  });
  if (!question) return NextResponse.json({ error: "No matching questions" }, { status: 404 });
  return NextResponse.json({
    id: question.id, stem: question.stem, type: question.type, typeLabel: QUESTION_TYPE_LABELS[question.type] ?? question.sourceType,
    difficulty: question.difficulty, isAutoGradable: question.isAutoGradable, subject: question.subject, grade: question.grade.name,
    options: question.options.map(({ label, content }) => ({ label, content })),
    tags: question.tags.map(({ tag }) => ({ dimension: tag.dimension.key, slug: tag.slug, label: tag.label })),
  });
}
