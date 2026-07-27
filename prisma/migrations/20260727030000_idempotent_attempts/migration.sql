ALTER TABLE "PracticeAttempt" ADD COLUMN "clientAttemptId" TEXT;
CREATE UNIQUE INDEX "PracticeAttempt_clientAttemptId_key" ON "PracticeAttempt"("clientAttemptId");
