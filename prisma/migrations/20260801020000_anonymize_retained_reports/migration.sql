-- A learner or account erasure must not remove an open content-safety report
-- or its immutable operator history. Retain the operational report while
-- severing the learner relation and deleting its free-text personal data.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_QuestionReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT,
    "questionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "reporterErasedAt" DATETIME,
    CONSTRAINT "QuestionReport_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_QuestionReport" (
    "id",
    "learnerId",
    "questionId",
    "category",
    "detail",
    "status",
    "createdAt",
    "updatedAt",
    "resolvedAt",
    "reporterErasedAt"
)
SELECT
    "id",
    "learnerId",
    "questionId",
    "category",
    "detail",
    "status",
    "createdAt",
    "updatedAt",
    "resolvedAt",
    NULL
FROM "QuestionReport";

DROP TABLE "QuestionReport";
ALTER TABLE "new_QuestionReport" RENAME TO "QuestionReport";
CREATE INDEX "QuestionReport_questionId_status_createdAt_idx" ON "QuestionReport"("questionId", "status", "createdAt");
CREATE INDEX "QuestionReport_learnerId_createdAt_idx" ON "QuestionReport"("learnerId", "createdAt");

CREATE TRIGGER "QuestionReport_anonymize_after_reporter_unlink"
AFTER UPDATE OF "learnerId" ON "QuestionReport"
FOR EACH ROW
WHEN OLD."learnerId" IS NOT NULL AND NEW."learnerId" IS NULL
BEGIN
    UPDATE "QuestionReport"
    SET
        "detail" = NULL,
        "reporterErasedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = NEW."id";
END;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
