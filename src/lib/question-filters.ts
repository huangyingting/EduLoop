import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { DIFFICULTIES, QUESTION_TYPE_LABELS } from "@/lib/content";

const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const identifierSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const difficultySchema = z.enum(DIFFICULTIES.map(({ key }) => key) as [string, ...string[]]);
const questionTypeSchema = z.enum(Object.keys(QUESTION_TYPE_LABELS) as [string, ...string[]]);
const querySchema = z.object({
  mode: z.enum(["standard", "review", "adaptive"]).default("standard"),
  deviceKey: z.string().min(8).max(100).optional(),
  subject: slugSchema.optional(),
  gradeBand: slugSchema.optional(),
  grade: slugSchema.optional(),
  difficulty: difficultySchema.optional(),
  type: questionTypeSchema.optional(),
  autoGradable: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

export type QuestionFilters = z.infer<typeof querySchema> & {
  excluded: string[];
  tagSlugs: string[];
};

function commaSeparated(value: string | null) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

export function parseQuestionFilters(params: URLSearchParams) {
  const scalar = querySchema.safeParse({
    mode: params.get("mode") || undefined,
    deviceKey: params.get("deviceKey") || undefined,
    subject: params.get("subject") || undefined,
    gradeBand: params.get("gradeBand") || undefined,
    grade: params.get("grade") || undefined,
    difficulty: params.get("difficulty") || undefined,
    type: params.get("type") || undefined,
    autoGradable: params.get("autoGradable") || undefined,
  });
  const excluded = z.array(identifierSchema).max(20).safeParse(commaSeparated(params.get("exclude")));
  const tagSlugs = z.array(slugSchema).max(8).safeParse(commaSeparated(params.get("tags")));
  if (!scalar.success || !excluded.success || !tagSlugs.success) return null;
  return { ...scalar.data, excluded: excluded.data, tagSlugs: tagSlugs.data } satisfies QuestionFilters;
}

export function questionWhere(filters: QuestionFilters): Prisma.QuestionWhereInput {
  return {
    status: "PUBLISHED",
    ...(filters.subject ? { subject: { slug: filters.subject } } : {}),
    ...(filters.gradeBand ? { gradeBand: { slug: filters.gradeBand } } : {}),
    ...(filters.grade ? { grade: { slug: filters.grade } } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.autoGradable ? { isAutoGradable: true } : {}),
    ...(filters.tagSlugs.length ? {
      tags: { some: { tag: { slug: { in: filters.tagSlugs }, dimension: { key: "TOPIC", isFilterable: true } } } },
    } : {}),
  };
}
