-- Guardian-managed child learner profiles: a profile is owned either by its
-- own account or by a guardian account, never both, and guardian consent for a
-- child is recorded against that child's profile.
-- AlterTable
ALTER TABLE "ConsentRecord" ADD COLUMN "subjectLearnerId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LearnerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "guardianUserId" TEXT,
    "displayName" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "streakFreezes" INTEGER NOT NULL DEFAULT 1,
    "lastFreezeUsedOn" TEXT,
    "lastActiveOn" TEXT,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "correctRun" INTEGER NOT NULL DEFAULT 0,
    "timeZone" TEXT,
    "timeZoneUpdatedAt" DATETIME,
    "knowledgeBandId" TEXT,
    "knowledgeGradeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnerProfile_knowledgeBandId_fkey" FOREIGN KEY ("knowledgeBandId") REFERENCES "GradeBand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LearnerProfile_knowledgeGradeId_fkey" FOREIGN KEY ("knowledgeGradeId") REFERENCES "Grade" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LearnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearnerProfile_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearnerProfile_single_owner_check" CHECK (("userId" IS NULL) <> ("guardianUserId" IS NULL))
);
INSERT INTO "new_LearnerProfile" ("bestStreak", "correctRun", "createdAt", "currentStreak", "displayName", "id", "knowledgeBandId", "knowledgeGradeId", "lastActiveOn", "lastFreezeUsedOn", "level", "streakFreezes", "timeZone", "timeZoneUpdatedAt", "totalAttempts", "updatedAt", "userId", "xp") SELECT "bestStreak", "correctRun", "createdAt", "currentStreak", "displayName", "id", "knowledgeBandId", "knowledgeGradeId", "lastActiveOn", "lastFreezeUsedOn", "level", "streakFreezes", "timeZone", "timeZoneUpdatedAt", "totalAttempts", "updatedAt", "userId", "xp" FROM "LearnerProfile";
DROP TABLE "LearnerProfile";
ALTER TABLE "new_LearnerProfile" RENAME TO "LearnerProfile";
CREATE UNIQUE INDEX "LearnerProfile_userId_key" ON "LearnerProfile"("userId");
CREATE INDEX "LearnerProfile_guardianUserId_idx" ON "LearnerProfile"("guardianUserId");
CREATE INDEX "LearnerProfile_knowledgeBandId_idx" ON "LearnerProfile"("knowledgeBandId");
CREATE INDEX "LearnerProfile_knowledgeGradeId_idx" ON "LearnerProfile"("knowledgeGradeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

