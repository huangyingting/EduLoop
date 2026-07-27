-- CreateTable
CREATE TABLE "SavedQuestion" (
    "learnerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("learnerId", "questionId"),
    CONSTRAINT "SavedQuestion_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "learnerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "lastResult" BOOLEAN,
    "lastAttemptAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("learnerId", "questionId"),
    CONSTRAINT "ReviewItem_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "QuestionReport_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedQuestion_learnerId_createdAt_idx" ON "SavedQuestion"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewItem_learnerId_status_dueAt_idx" ON "ReviewItem"("learnerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_status_createdAt_idx" ON "QuestionReport"("questionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_learnerId_createdAt_idx" ON "QuestionReport"("learnerId", "createdAt");
