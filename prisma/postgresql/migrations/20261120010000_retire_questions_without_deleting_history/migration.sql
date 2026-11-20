-- Questions removed from the source catalog are retired instead of deleted so
-- attempts, reviews, saved items, reports, and moderation history survive
-- re-imports. A merged duplicate records the question that replaced it.
ALTER TABLE "Question" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "supersededById" TEXT;

