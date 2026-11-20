-- AMC contest papers and timed sessions, per-subject ability ratings for
-- difficulty targeting, and an index for unseen-question selection.
-- AlterTable
ALTER TABLE "LearnerSubjectStat" ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PracticeAttempt" ADD COLUMN     "contestSessionId" TEXT;

-- CreateTable
CREATE TABLE "ContestPaper" (
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "contest" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,

    CONSTRAINT "ContestPaper_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ContestPaperSlot" (
    "paperKey" TEXT NOT NULL,
    "problemNumber" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,

    CONSTRAINT "ContestPaperSlot_pkey" PRIMARY KEY ("paperKey","problemNumber")
);

-- CreateTable
CREATE TABLE "ContestSession" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "paperKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "answersJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "correctCount" INTEGER,
    "blankCount" INTEGER,
    "wrongCount" INTEGER,

    CONSTRAINT "ContestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContestPaper_level_year_idx" ON "ContestPaper"("level", "year");

-- CreateIndex
CREATE INDEX "ContestPaperSlot_questionId_idx" ON "ContestPaperSlot"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestSession_activeKey_key" ON "ContestSession"("activeKey");

-- CreateIndex
CREATE INDEX "ContestSession_learnerId_paperKey_submittedAt_idx" ON "ContestSession"("learnerId", "paperKey", "submittedAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_learnerId_questionId_idx" ON "PracticeAttempt"("learnerId", "questionId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_contestSessionId_idx" ON "PracticeAttempt"("contestSessionId");

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_contestSessionId_fkey" FOREIGN KEY ("contestSessionId") REFERENCES "ContestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPaperSlot" ADD CONSTRAINT "ContestPaperSlot_paperKey_fkey" FOREIGN KEY ("paperKey") REFERENCES "ContestPaper"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPaperSlot" ADD CONSTRAINT "ContestPaperSlot_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestSession" ADD CONSTRAINT "ContestSession_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestSession" ADD CONSTRAINT "ContestSession_paperKey_fkey" FOREIGN KEY ("paperKey") REFERENCES "ContestPaper"("key") ON DELETE CASCADE ON UPDATE CASCADE;

