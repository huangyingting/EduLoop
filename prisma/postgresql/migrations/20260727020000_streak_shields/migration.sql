ALTER TABLE "LearnerProfile" ADD COLUMN "streakFreezes" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LearnerProfile" ADD COLUMN "lastFreezeUsedOn" TEXT;
