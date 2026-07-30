PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Anonymous learning records predate the account-only privacy boundary. Their
-- dependent attempts, sessions, reviews, saves, reports, and activity are
-- explicitly removed before the old profile table is replaced.
DELETE FROM "ContentReviewAction" WHERE "reportId" IN (
    SELECT "id" FROM "QuestionReport" WHERE "learnerId" IN (
        SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL
    )
);
DELETE FROM "QuestionReport" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
DELETE FROM "ReviewItem" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
DELETE FROM "SavedQuestion" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
DELETE FROM "DailyActivity" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
DELETE FROM "LearnerBadge" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
DELETE FROM "PracticeAttempt" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
DELETE FROM "PracticeSession" WHERE "learnerId" IN (SELECT "id" FROM "LearnerProfile" WHERE "userId" IS NULL);
CREATE TABLE "new_LearnerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "streakFreezes" INTEGER NOT NULL DEFAULT 1,
    "lastFreezeUsedOn" TEXT,
    "lastActiveOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_LearnerProfile" (
    "id", "userId", "displayName", "xp", "level", "currentStreak",
    "bestStreak", "streakFreezes", "lastFreezeUsedOn", "lastActiveOn",
    "createdAt", "updatedAt"
)
SELECT
    "id", "userId", "displayName", "xp", "level", "currentStreak",
    "bestStreak", "streakFreezes", "lastFreezeUsedOn", "lastActiveOn",
    "createdAt", "updatedAt"
FROM "LearnerProfile"
WHERE "userId" IS NOT NULL;

DROP TABLE "LearnerProfile";
ALTER TABLE "new_LearnerProfile" RENAME TO "LearnerProfile";
CREATE UNIQUE INDEX "LearnerProfile_userId_key" ON "LearnerProfile"("userId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
