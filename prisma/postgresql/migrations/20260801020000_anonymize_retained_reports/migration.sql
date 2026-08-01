-- A learner or account erasure must not remove an open content-safety report
-- or its immutable operator history. Retain the operational report while
-- severing the learner relation and deleting its free-text personal data.
ALTER TABLE "QuestionReport" DROP CONSTRAINT "QuestionReport_learnerId_fkey";
ALTER TABLE "QuestionReport" ALTER COLUMN "learnerId" DROP NOT NULL;
ALTER TABLE "QuestionReport" ADD COLUMN "reporterErasedAt" TIMESTAMP(3);
ALTER TABLE "QuestionReport"
ADD CONSTRAINT "QuestionReport_learnerId_fkey"
FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "anonymize_question_report_on_reporter_unlink"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."detail" := NULL;
    NEW."reporterErasedAt" := CURRENT_TIMESTAMP;
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "QuestionReport_anonymize_before_reporter_unlink"
BEFORE UPDATE OF "learnerId" ON "QuestionReport"
FOR EACH ROW
WHEN (OLD."learnerId" IS NOT NULL AND NEW."learnerId" IS NULL)
EXECUTE FUNCTION "anonymize_question_report_on_reporter_unlink"();
