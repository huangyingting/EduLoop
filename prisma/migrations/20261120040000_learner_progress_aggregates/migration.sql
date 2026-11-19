-- Per-learner subject and topic accuracy aggregates for the progress view.
-- CreateTable
CREATE TABLE "LearnerSubjectStat" (
    "learnerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME NOT NULL,

    PRIMARY KEY ("learnerId", "subjectId"),
    CONSTRAINT "LearnerSubjectStat_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearnerSubjectStat_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearnerTopicStat" (
    "learnerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME NOT NULL,

    PRIMARY KEY ("learnerId", "subjectId", "tagId"),
    CONSTRAINT "LearnerTopicStat_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearnerTopicStat_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearnerTopicStat_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LearnerTopicStat_tagId_idx" ON "LearnerTopicStat"("tagId");


-- Backfill from existing graded attempts. Self-assessed attempts count once
-- the learner has assessed them, matching the progress view.
INSERT INTO "LearnerSubjectStat" ("learnerId", "subjectId", "attempts", "correct", "lastAttemptAt")
SELECT attempt."learnerId", question."subjectId", COUNT(*),
  SUM(CASE WHEN attempt."isCorrect" = 1 THEN 1 ELSE 0 END), MAX(attempt."createdAt")
FROM "PracticeAttempt" AS attempt
INNER JOIN "Question" AS question ON question."id" = attempt."questionId"
WHERE attempt."isCorrect" IS NOT NULL
GROUP BY attempt."learnerId", question."subjectId";

INSERT INTO "LearnerTopicStat" ("learnerId", "subjectId", "tagId", "attempts", "correct", "lastAttemptAt")
SELECT attempt."learnerId", question."subjectId", link."tagId", COUNT(*),
  SUM(CASE WHEN attempt."isCorrect" = 1 THEN 1 ELSE 0 END), MAX(attempt."createdAt")
FROM "PracticeAttempt" AS attempt
INNER JOIN "Question" AS question ON question."id" = attempt."questionId"
INNER JOIN "QuestionTag" AS link ON link."questionId" = question."id"
INNER JOIN "Tag" AS tag ON tag."id" = link."tagId"
INNER JOIN "TagDimension" AS dimension ON dimension."id" = tag."dimensionId"
WHERE attempt."isCorrect" IS NOT NULL AND dimension."key" = 'TOPIC'
GROUP BY attempt."learnerId", question."subjectId", link."tagId";
