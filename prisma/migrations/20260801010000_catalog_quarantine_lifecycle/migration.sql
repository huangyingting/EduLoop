-- Keep source/import eligibility separate from an operator quarantine so a
-- routine catalog import cannot silently republish a known-bad question.
ALTER TABLE "Question" ADD COLUMN "importStatus" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Question" ADD COLUMN "quarantinedAt" DATETIME;

-- Preserve the current import decision for existing rows. The following seed
-- refreshes it from source while retaining any active operator quarantine.
UPDATE "Question"
SET "importStatus" = "status";

-- Recover active quarantines created before the provenance column existed.
-- A historical QUARANTINE action plus any still-open report for the question
-- qualifies. The action and remaining report may differ when one of several
-- reports was resolved before this migration.
UPDATE "Question"
SET "quarantinedAt" = (
  SELECT MAX("ContentReviewAction"."createdAt")
  FROM "ContentReviewAction"
  INNER JOIN "QuestionReport"
    ON "QuestionReport"."id" = "ContentReviewAction"."reportId"
  WHERE "QuestionReport"."questionId" = "Question"."id"
    AND "ContentReviewAction"."action" = 'QUARANTINE'
)
WHERE "Question"."status" = 'NEEDS_REVIEW'
  AND EXISTS (
    SELECT 1
    FROM "QuestionReport"
    WHERE "QuestionReport"."questionId" = "Question"."id"
      AND "QuestionReport"."status" = 'OPEN'
  )
  AND EXISTS (
    SELECT 1
    FROM "ContentReviewAction"
    INNER JOIN "QuestionReport"
      ON "QuestionReport"."id" = "ContentReviewAction"."reportId"
    WHERE "QuestionReport"."questionId" = "Question"."id"
      AND "ContentReviewAction"."action" = 'QUARANTINE'
  );
