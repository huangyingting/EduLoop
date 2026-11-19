-- Editorial question revisions, re-grading markers, and uploaded question images.
-- AlterTable
ALTER TABLE "PracticeAttempt" ADD COLUMN     "regradedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "revisionId" TEXT;

-- CreateTable
CREATE TABLE "QuestionRevision" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correctAnswer" TEXT,
    "explanation" TEXT,
    "topicTagIdsJson" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetBlob" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetBlob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionRevision_questionId_status_createdAt_idx" ON "QuestionRevision"("questionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionRevision_authorId_idx" ON "QuestionRevision"("authorId");

-- CreateIndex
CREATE INDEX "QuestionRevision_reviewerId_idx" ON "QuestionRevision"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetBlob_sha256_key" ON "AssetBlob"("sha256");

-- AddForeignKey
ALTER TABLE "QuestionRevision" ADD CONSTRAINT "QuestionRevision_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionRevision" ADD CONSTRAINT "QuestionRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionRevision" ADD CONSTRAINT "QuestionRevision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

