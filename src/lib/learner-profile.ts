import { z } from "zod";

export const catalogSlugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const learnerProfileInputSchema = z.object({
  displayName: z.string().trim().max(50),
  knowledgeBand: catalogSlugSchema.nullable(),
  knowledgeGrade: catalogSlugSchema.nullable(),
}).refine(
  (profile) => profile.knowledgeBand || !profile.knowledgeGrade,
  { message: "A knowledge grade requires a knowledge band.", path: ["knowledgeGrade"] },
);

export type LearnerProfileInput = z.infer<typeof learnerProfileInputSchema>;
