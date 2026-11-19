-- Hot-path counters replace per-attempt COUNT(*) queries for badges, and an
-- indexed random key replaces OFFSET-based random question selection.
ALTER TABLE "LearnerProfile" ADD COLUMN     "correctRun" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Question" ADD COLUMN     "randomKey" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "Question_status_randomKey_idx" ON "Question"("status", "randomKey");

UPDATE "Question"
SET "randomKey" = random();

-- correctRun counts automatically graded correct answers since the learner's
-- latest automatically graded mistake; self-assessed work neither extends nor
-- breaks the run.
UPDATE "LearnerProfile"
SET
  "totalAttempts" = (
    SELECT COUNT(*) FROM "PracticeAttempt" AS attempt
    WHERE attempt."learnerId" = "LearnerProfile"."id"
  ),
  "correctRun" = (
    SELECT COUNT(*) FROM "PracticeAttempt" AS attempt
    WHERE attempt."learnerId" = "LearnerProfile"."id"
      AND attempt."isSelfAssessed" = false
      AND attempt."isCorrect" = true
      AND NOT EXISTS (
        SELECT 1 FROM "PracticeAttempt" AS mistake
        WHERE mistake."learnerId" = attempt."learnerId"
          AND mistake."isSelfAssessed" = false
          AND mistake."isCorrect" = false
          AND mistake."createdAt" >= attempt."createdAt"
      )
  );
