-- Question-specific progressive hints and per-attempt hint usage.
-- AlterTable
ALTER TABLE "PracticeAttempt" ADD COLUMN     "hintsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "QuestionHint" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionHint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionHint_questionId_reviewStatus_position_idx" ON "QuestionHint"("questionId", "reviewStatus", "position");

-- AddForeignKey
ALTER TABLE "QuestionHint" ADD CONSTRAINT "QuestionHint_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

