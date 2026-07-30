-- Remove historical anonymous learning data and enforce that every learner
-- profile belongs to an authenticated account.
DELETE FROM "LearnerProfile" WHERE "userId" IS NULL;

ALTER TABLE "LearnerProfile" DROP CONSTRAINT "LearnerProfile_userId_fkey";
ALTER TABLE "LearnerProfile" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "LearnerProfile" DROP COLUMN "deviceKey";
ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
