-- Keep only the newest historical active session per learner before adding the
-- portable nullable unique slot used by both SQLite and PostgreSQL schemas.
WITH "ranked" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "learnerId"
      ORDER BY "startedAt" DESC, "id" DESC
    ) AS "position"
  FROM "PracticeSession"
  WHERE "status" = 'ACTIVE'
)
UPDATE "PracticeSession" AS "session"
SET "status" = 'ABANDONED',
    "completedAt" = COALESCE("session"."completedAt", CURRENT_TIMESTAMP)
FROM "ranked"
WHERE "session"."id" = "ranked"."id"
  AND "ranked"."position" > 1;

ALTER TABLE "PracticeSession" ADD COLUMN "activeKey" TEXT;
UPDATE "PracticeSession" SET "activeKey" = "learnerId" WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "PracticeSession_activeKey_key" ON "PracticeSession"("activeKey");
