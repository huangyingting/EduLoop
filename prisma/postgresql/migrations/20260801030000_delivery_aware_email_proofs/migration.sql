-- Keep the last accepted proof usable until its replacement email is accepted.
-- Existing proof rows may already have been sent, so backfill them as delivered.
ALTER TABLE "EmailVerificationToken" ADD COLUMN "deliveredAt" TIMESTAMP(3);
UPDATE "EmailVerificationToken" SET "deliveredAt" = "createdAt";

ALTER TABLE "PasswordResetToken" ADD COLUMN "deliveredAt" TIMESTAMP(3);
UPDATE "PasswordResetToken" SET "deliveredAt" = "createdAt";

ALTER TABLE "EmailChangeToken" ADD COLUMN "deliveredAt" TIMESTAMP(3);
UPDATE "EmailChangeToken" SET "deliveredAt" = "createdAt";

-- Permit a delivered email-change proof to coexist with replacements that are
-- still in flight. Delivery finalization retains only its accepted winner.
DROP INDEX "EmailChangeToken_userId_key";
CREATE INDEX "EmailChangeToken_userId_expiresAt_idx" ON "EmailChangeToken"("userId", "expiresAt");
