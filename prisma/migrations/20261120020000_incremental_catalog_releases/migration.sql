-- Each question records a hash of its normalized import so routine imports
-- write only changed rows. CatalogRelease records which source manifest is live.
-- AlterTable
ALTER TABLE "Question" ADD COLUMN "contentHash" TEXT;

-- CreateTable
CREATE TABLE "CatalogRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "retired" INTEGER NOT NULL,
    "revived" INTEGER NOT NULL,
    "superseded" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CatalogRelease_scope_completedAt_idx" ON "CatalogRelease"("scope", "completedAt");

