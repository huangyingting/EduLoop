-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "gradeBandId" TEXT NOT NULL,
    CONSTRAINT "Grade_gradeBandId_fkey" FOREIGN KEY ("gradeBandId") REFERENCES "GradeBand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correctAnswer" TEXT,
    "explanation" TEXT,
    "quality" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "isAutoGradable" BOOLEAN NOT NULL DEFAULT false,
    "onlineTest" BOOLEAN NOT NULL DEFAULT false,
    "optionSplit" BOOLEAN NOT NULL DEFAULT false,
    "subjectId" TEXT NOT NULL,
    "gradeBandId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Question_gradeBandId_fkey" FOREIGN KEY ("gradeBandId") REFERENCES "GradeBand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Question_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TagDimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "dimensionId" TEXT NOT NULL,
    CONSTRAINT "Tag_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "TagDimension" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionTag" (
    "questionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'IMPORT',

    PRIMARY KEY ("questionId", "tagId"),
    CONSTRAINT "QuestionTag_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearnerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceKey" TEXT NOT NULL,
    "displayName" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "filtersJson" TEXT NOT NULL,
    "questionGoal" INTEGER NOT NULL DEFAULT 10,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "earnedXp" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PracticeSession_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "isSelfAssessed" BOOLEAN NOT NULL DEFAULT false,
    "secondsSpent" INTEGER,
    "earnedXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeAttempt_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PracticeAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PracticeAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "threshold" INTEGER
);

-- CreateTable
CREATE TABLE "LearnerBadge" (
    "learnerId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("learnerId", "badgeId"),
    CONSTRAINT "LearnerBadge_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearnerBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "activityDate" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "earnedXp" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DailyActivity_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBand_slug_key" ON "GradeBand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_slug_key" ON "Grade"("slug");

-- CreateIndex
CREATE INDEX "Grade_gradeBandId_sortOrder_idx" ON "Grade"("gradeBandId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Question_sourceId_key" ON "Question"("sourceId");

-- CreateIndex
CREATE INDEX "Question_subjectId_gradeBandId_difficulty_idx" ON "Question"("subjectId", "gradeBandId", "difficulty");

-- CreateIndex
CREATE INDEX "Question_gradeId_type_status_idx" ON "Question"("gradeId", "type", "status");

-- CreateIndex
CREATE INDEX "Question_status_isAutoGradable_idx" ON "Question"("status", "isAutoGradable");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_sortOrder_idx" ON "QuestionOption"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_label_key" ON "QuestionOption"("questionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "TagDimension_key_key" ON "TagDimension"("key");

-- CreateIndex
CREATE INDEX "Tag_dimensionId_label_idx" ON "Tag"("dimensionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_dimensionId_slug_key" ON "Tag"("dimensionId", "slug");

-- CreateIndex
CREATE INDEX "QuestionTag_tagId_questionId_idx" ON "QuestionTag"("tagId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerProfile_deviceKey_key" ON "LearnerProfile"("deviceKey");

-- CreateIndex
CREATE INDEX "PracticeSession_learnerId_startedAt_idx" ON "PracticeSession"("learnerId", "startedAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_learnerId_createdAt_idx" ON "PracticeAttempt"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_questionId_isCorrect_idx" ON "PracticeAttempt"("questionId", "isCorrect");

-- CreateIndex
CREATE INDEX "PracticeAttempt_sessionId_idx" ON "PracticeAttempt"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE INDEX "DailyActivity_activityDate_idx" ON "DailyActivity"("activityDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivity_learnerId_activityDate_key" ON "DailyActivity"("learnerId", "activityDate");
