ALTER TABLE "LearnerProfile" ADD COLUMN "knowledgeBandId" TEXT;
ALTER TABLE "LearnerProfile" ADD COLUMN "knowledgeGradeId" TEXT;

ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_knowledgeBandId_fkey"
  FOREIGN KEY ("knowledgeBandId") REFERENCES "GradeBand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_knowledgeGradeId_fkey"
  FOREIGN KEY ("knowledgeGradeId") REFERENCES "Grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LearnerProfile_knowledgeBandId_idx" ON "LearnerProfile"("knowledgeBandId");
CREATE INDEX "LearnerProfile_knowledgeGradeId_idx" ON "LearnerProfile"("knowledgeGradeId");
