-- Question-specific progressive hints and per-attempt hint usage.
-- CreateTable
CREATE TABLE "QuestionHint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionHint_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "PracticeAttempt" ADD COLUMN "hintsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "QuestionHint_questionId_reviewStatus_position_idx" ON "QuestionHint"("questionId", "reviewStatus", "position");

