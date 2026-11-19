-- Data-driven badge rules, a stored learner time zone for streaks, and a
-- long-term check schedule for mastered review items.
-- AlterTable
ALTER TABLE "Badge" ADD COLUMN     "rule" TEXT;

-- AlterTable
ALTER TABLE "LearnerProfile" ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "timeZoneUpdatedAt" TIMESTAMP(3);


-- Existing badges receive the rules that were previously hard-coded.
UPDATE "Badge" SET "rule" = '{"type":"TOTAL_ATTEMPTS","threshold":1}' WHERE "slug" = 'first-spark';
UPDATE "Badge" SET "rule" = '{"type":"TOTAL_ATTEMPTS","threshold":100}' WHERE "slug" = 'century-club';
UPDATE "Badge" SET "rule" = '{"type":"CORRECT_RUN","threshold":10}' WHERE "slug" = 'ten-in-a-row';

-- Mastered review items now receive a long-term check 30 days after mastery
-- instead of never resurfacing.
UPDATE "ReviewItem"
SET "intervalDays" = 30, "dueAt" = "lastAttemptAt" + INTERVAL '30 days'
WHERE "status" = 'MASTERED';
