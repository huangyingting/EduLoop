-- AMC contest papers and timed sessions, per-subject ability ratings for
-- difficulty targeting, and an index for unseen-question selection.
-- CreateTable
CREATE TABLE "ContestPaper" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "contest" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ContestPaperSlot" (
    "paperKey" TEXT NOT NULL,
    "problemNumber" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,

    PRIMARY KEY ("paperKey", "problemNumber"),
    CONSTRAINT "ContestPaperSlot_paperKey_fkey" FOREIGN KEY ("paperKey") REFERENCES "ContestPaper" ("key") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContestPaperSlot_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContestSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "paperKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "answersJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" DATETIME NOT NULL,
    "submittedAt" DATETIME,
    "score" REAL,
    "correctCount" INTEGER,
    "blankCount" INTEGER,
    "wrongCount" INTEGER,
    CONSTRAINT "ContestSession_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContestSession_paperKey_fkey" FOREIGN KEY ("paperKey") REFERENCES "ContestPaper" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "LearnerSubjectStat" ADD COLUMN "rating" REAL NOT NULL DEFAULT 1;
ALTER TABLE "PracticeAttempt" ADD COLUMN "contestSessionId" TEXT REFERENCES "ContestSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PracticeAttempt_learnerId_questionId_idx" ON "PracticeAttempt"("learnerId", "questionId");
CREATE INDEX "PracticeAttempt_contestSessionId_idx" ON "PracticeAttempt"("contestSessionId");

-- CreateIndex
CREATE INDEX "ContestPaper_level_year_idx" ON "ContestPaper"("level", "year");

-- CreateIndex
CREATE INDEX "ContestPaperSlot_questionId_idx" ON "ContestPaperSlot"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestSession_activeKey_key" ON "ContestSession"("activeKey");

-- CreateIndex
CREATE INDEX "ContestSession_learnerId_paperKey_submittedAt_idx" ON "ContestSession"("learnerId", "paperKey", "submittedAt");

