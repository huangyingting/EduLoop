-- Bound abandoned password registrations and support indexed cleanup. Existing
-- candidates receive a full 30-day grace period from this deployment.
ALTER TABLE "User" ADD COLUMN "registrationExpiresAt" TIMESTAMP(3);

UPDATE "User"
SET "registrationExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE "emailVerified" IS NULL
  AND "passwordHash" IS NOT NULL
  AND "role" = 'LEARNER'
  AND NOT EXISTS (
    SELECT 1 FROM "Account" WHERE "Account"."userId" = "User"."id"
  );

CREATE INDEX "User_emailVerified_role_registrationExpiresAt_idx"
ON "User"("emailVerified", "role", "registrationExpiresAt");
