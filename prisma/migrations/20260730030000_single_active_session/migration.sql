-- Keep only the newest historical active session per learner before adding the
-- portable nullable unique slot used by both SQLite and PostgreSQL schemas.
UPDATE "PracticeSession"
SET "status" = 'ABANDONED',
    "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'ACTIVE'
  AND "id" NOT IN (
    SELECT "id" FROM (
      SELECT
        "id",
        ROW_NUMBER() OVER (
          PARTITION BY "learnerId"
          ORDER BY "startedAt" DESC, "id" DESC
        ) AS "position"
      FROM "PracticeSession"
      WHERE "status" = 'ACTIVE'
    ) AS "ranked"
    WHERE "position" = 1
  );

ALTER TABLE "PracticeSession" ADD COLUMN "activeKey" TEXT;
UPDATE "PracticeSession" SET "activeKey" = "learnerId" WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "PracticeSession_activeKey_key" ON "PracticeSession"("activeKey");
