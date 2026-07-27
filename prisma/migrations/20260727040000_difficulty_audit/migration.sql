ALTER TABLE "Question" ADD COLUMN "sourceDifficulty" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Question" ADD COLUMN "difficultyScore" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Question" ADD COLUMN "difficultyConfidence" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Question" ADD COLUMN "difficultyReason" TEXT NOT NULL DEFAULT 'Pending difficulty audit';
ALTER TABLE "Question" ADD COLUMN "difficultyAuditVersion" INTEGER NOT NULL DEFAULT 1;
