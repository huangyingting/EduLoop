-- Guardian-managed child learner profiles: a profile is owned either by its
-- own account or by a guardian account, never both, and guardian consent for a
-- child is recorded against that child's profile.
-- AlterTable
ALTER TABLE "ConsentRecord" ADD COLUMN     "subjectLearnerId" TEXT;

-- AlterTable
ALTER TABLE "LearnerProfile" ADD COLUMN     "guardianUserId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "LearnerProfile_guardianUserId_idx" ON "LearnerProfile"("guardianUserId");

-- AddForeignKey
ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every profile has exactly one owner: its own account or a guardian.
ALTER TABLE "LearnerProfile" ADD CONSTRAINT "LearnerProfile_single_owner_check"
  CHECK (("userId" IS NULL) <> ("guardianUserId" IS NULL));
