ALTER TABLE "PracticeAttempt" ADD COLUMN "explanationViewedAt" TIMESTAMP(3);

CREATE INDEX "PracticeAttempt_createdAt_isCorrect_explanationViewedAt_idx" ON "PracticeAttempt"("createdAt", "isCorrect", "explanationViewedAt");
