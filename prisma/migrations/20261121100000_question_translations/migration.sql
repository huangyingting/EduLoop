-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "questionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "explanation" TEXT,
    "hints" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("questionId", "locale"),
    CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuestionTranslation_locale_idx" ON "QuestionTranslation"("locale");

