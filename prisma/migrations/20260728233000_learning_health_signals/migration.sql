ALTER TABLE "PracticeAttempt" ADD COLUMN "explanationViewedAt" DATETIME;

CREATE INDEX "PracticeAttempt_createdAt_isCorrect_explanationViewedAt_idx" ON "PracticeAttempt"("createdAt", "isCorrect", "explanationViewedAt");
