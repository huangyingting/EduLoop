-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "questionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "explanation" TEXT,
    "hints" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("questionId","locale")
);

-- CreateIndex
CREATE INDEX "QuestionTranslation_locale_idx" ON "QuestionTranslation"("locale");

-- AddForeignKey
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

