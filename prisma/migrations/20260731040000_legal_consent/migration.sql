ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyAcceptedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "privacyVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "consentBasis" TEXT;

CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ConsentRecord_userId_acceptedAt_idx" ON "ConsentRecord"("userId", "acceptedAt");
