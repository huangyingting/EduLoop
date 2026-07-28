ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'LEARNER';

CREATE INDEX "User_role_idx" ON "User"("role");

CREATE TABLE "ContentReviewAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReviewAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentReviewAction_reportId_createdAt_idx" ON "ContentReviewAction"("reportId", "createdAt");
CREATE INDEX "ContentReviewAction_actorId_createdAt_idx" ON "ContentReviewAction"("actorId", "createdAt");

ALTER TABLE "ContentReviewAction" ADD CONSTRAINT "ContentReviewAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "QuestionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReviewAction" ADD CONSTRAINT "ContentReviewAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
