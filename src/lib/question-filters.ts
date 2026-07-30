import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { DIFFICULTIES, QUESTION_TYPE_LABELS } from "@/lib/content";

const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dimensionSchema = z.string().min(1).max(40).regex(/^[A-Z][A-Z0-9_]*$/);
const identifierSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const difficultySchema = z.enum(DIFFICULTIES.map(({ key }) => key) as [string, ...string[]]);
const questionTypeSchema = z.enum(Object.keys(QUESTION_TYPE_LABELS) as [string, ...string[]]);
const querySchema = z.object({
  mode: z.enum(["standard", "review", "adaptive"]).default("standard"),
  questionId: identifierSchema.optional(),
  subject: slugSchema.optional(),
  gradeBand: slugSchema.optional(),
  grade: slugSchema.optional(),
  difficulty: difficultySchema.optional(),
  type: questionTypeSchema.optional(),
  autoGradable: z.enum(["true", "false"]).optional()
    .transform((value) => value === undefined ? undefined : value === "true"),
});

export type QuestionFilters = z.infer<typeof querySchema> & {
  excluded: string[];
  tagFilters: Array<{ dimension: string; slug: string }>;
};

function commaSeparated(value: string | null) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

export function parseQuestionFilters(params: URLSearchParams) {
  const scalar = querySchema.safeParse({
    mode: params.get("mode") || undefined,
    questionId: params.get("questionId") || undefined,
    subject: params.get("subject") || undefined,
    gradeBand: params.get("gradeBand") || undefined,
    grade: params.get("grade") || undefined,
    difficulty: params.get("difficulty") || undefined,
    type: params.get("type") || undefined,
    autoGradable: params.get("autoGradable") || undefined,
  });
  const excluded = z.array(identifierSchema).max(20).safeParse(commaSeparated(params.get("exclude")));
  const tagFilters = z.array(z.object({ dimension: dimensionSchema, slug: slugSchema })).max(8).safeParse(
    commaSeparated(params.get("tags")).map((value) => {
      const separator = value.indexOf(":");
      return separator === -1
        ? { dimension: "TOPIC", slug: value }
        : { dimension: value.slice(0, separator), slug: value.slice(separator + 1) };
    }),
  );
  if (!scalar.success || !excluded.success || !tagFilters.success) return null;
  return { ...scalar.data, excluded: excluded.data, tagFilters: tagFilters.data } satisfies QuestionFilters;
}

export function questionWhere(filters: QuestionFilters): Prisma.QuestionWhereInput {
  const tagsByDimension = new Map<string, string[]>();
  for (const filter of filters.tagFilters) {
    const slugs = tagsByDimension.get(filter.dimension) ?? [];
    if (!slugs.includes(filter.slug)) slugs.push(filter.slug);
    tagsByDimension.set(filter.dimension, slugs);
  }
  return {
    status: "PUBLISHED",
    ...(filters.questionId ? { id: filters.questionId } : {}),
    ...(filters.subject ? { subject: { slug: filters.subject } } : {}),
    ...(filters.gradeBand ? { gradeBand: { slug: filters.gradeBand } } : {}),
    ...(filters.grade ? { grade: { slug: filters.grade } } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.autoGradable !== undefined ? { isAutoGradable: filters.autoGradable } : {}),
    ...(tagsByDimension.size ? {
      AND: [...tagsByDimension].map(([dimension, slugs]) => ({
        tags: { some: { tag: { slug: { in: slugs }, dimension: { key: dimension, isFilterable: true } } } },
      })),
    } : {}),
  };
}
