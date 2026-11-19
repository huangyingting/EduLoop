import { z } from "zod";

export const catalogSlugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const learnerProfileInputSchema = z.object({
  displayName: z.string().trim().max(50),
  knowledgeBand: catalogSlugSchema.nullable(),
  knowledgeGrade: catalogSlugSchema.nullable(),
  timeZone: z.string().min(1).max(100).optional(),
}).refine(
  (profile) => profile.knowledgeBand || !profile.knowledgeGrade,
  { message: "A knowledge grade requires a knowledge band.", path: ["knowledgeGrade"] },
);

export type LearnerProfileInput = z.infer<typeof learnerProfileInputSchema>;

// The calendar day for streaks follows the stored zone. Allowing only one
// change per day keeps a learner from manufacturing extra streak days.
export const TIME_ZONE_CHANGE_INTERVAL_MS = 24 * 60 * 60_000;

export function canChangeTimeZone(updatedAt: Date | null, now = new Date()) {
  return !updatedAt || now.getTime() - updatedAt.getTime() >= TIME_ZONE_CHANGE_INTERVAL_MS;
}
