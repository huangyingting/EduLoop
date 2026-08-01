-- Keep the last accepted proof usable until its replacement email is accepted.
-- Existing proof rows may already have been sent, so backfill them as delivered.
ALTER TABLE "EmailVerificationToken" ADD COLUMN "deliveredAt" DATETIME;
UPDATE "EmailVerificationToken" SET "deliveredAt" = "createdAt";

ALTER TABLE "PasswordResetToken" ADD COLUMN "deliveredAt" DATETIME;
UPDATE "PasswordResetToken" SET "deliveredAt" = "createdAt";

-- Email changes previously allowed only one row per user. Multiple rows are
-- required while an older delivered proof and its replacement are in flight.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_EmailChangeToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_EmailChangeToken" (
    "id",
    "userId",
    "newEmail",
    "tokenHash",
    "expiresAt",
    "deliveredAt",
    "createdAt"
)
SELECT
    "id",
    "userId",
    "newEmail",
    "tokenHash",
    "expiresAt",
    "createdAt",
    "createdAt"
FROM "EmailChangeToken";

DROP TABLE "EmailChangeToken";
ALTER TABLE "new_EmailChangeToken" RENAME TO "EmailChangeToken";
CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE INDEX "EmailChangeToken_userId_expiresAt_idx" ON "EmailChangeToken"("userId", "expiresAt");
CREATE INDEX "EmailChangeToken_expiresAt_idx" ON "EmailChangeToken"("expiresAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
