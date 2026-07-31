-- Verification now requires the password that initiated registration or
-- password setup. A social-only account has no such password, so verification
-- links issued by an older release cannot be completed safely and are revoked.
DELETE FROM "EmailVerificationToken"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "passwordHash" IS NULL
);
