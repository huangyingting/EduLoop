-- CreateTable
CREATE TABLE "SavedQuestion" (
    "learnerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedQuestion_pkey" PRIMARY KEY ("learnerId", "questionId")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "learnerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "lastResult" BOOLEAN,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("learnerId", "questionId")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedQuestion_learnerId_createdAt_idx" ON "SavedQuestion"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewItem_learnerId_status_dueAt_idx" ON "ReviewItem"("learnerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_status_createdAt_idx" ON "QuestionReport"("questionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_learnerId_createdAt_idx" ON "QuestionReport"("learnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedQuestion" ADD CONSTRAINT "SavedQuestion_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuestion" ADD CONSTRAINT "SavedQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
