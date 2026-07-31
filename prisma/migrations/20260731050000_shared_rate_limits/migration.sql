CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "windowStart" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
