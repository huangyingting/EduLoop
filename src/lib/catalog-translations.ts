import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { SourceQuestion } from "@/lib/content";
import { deriveEnglishContestHints } from "@/lib/hint-derivation";

// Imports question content in a non-default language (today, the English AMC
// sources) as translations of existing questions with the same stable ID.
// Grading, answers, assets, and tags always come from the default-locale
// question, so a translation is used only when its option labels match it.

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

export type TranslatedQuestion = {
  questionId: string;
  locale: string;
  stem: string;
  options: Array<{ label: string; content: string }>;
  explanation: string | null;
  hints: string[];
};

export type TranslationImportSummary = {
  locale: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  skippedMissingQuestion: number;
  skippedOptionMismatch: number;
};

export function normalizeTranslatedQuestion(question: SourceQuestion, locale: string, sourceFile: string): TranslatedQuestion | null {
  const stem = String(question.stem ?? "").trim();
  if (!stem) return null;
  const options = OPTION_LABELS
    .map((label) => ({ label, content: String(question.options?.[label] ?? "").trim() }))
    .filter((option) => option.content);
  const solutions = question.solutions ?? [];
  const isContest = /^amc(?:8|10|12)\.json$/.test(sourceFile);
  return {
    questionId: question.id,
    locale,
    stem,
    options,
    explanation: solutions.map((solution) => solution?.trim()).filter(Boolean).join("\n\n") || null,
    hints: locale === "en" && isContest
      ? deriveEnglishContestHints({ solutions, answer: String(question.answer ?? "") }).map(({ content }) => content)
      : [],
  };
}

export function translationHash(translation: TranslatedQuestion) {
  return createHash("sha256")
    .update(JSON.stringify([translation.stem, translation.options, translation.explanation, translation.hints]))
    .digest("hex");
}

export async function importTranslations(
  prisma: PrismaClient,
  locale: string,
  translations: TranslatedQuestion[],
  options: { dryRun?: boolean } = {},
): Promise<TranslationImportSummary> {
  const summary: TranslationImportSummary = {
    locale, total: translations.length, created: 0, updated: 0, unchanged: 0, removed: 0, skippedMissingQuestion: 0, skippedOptionMismatch: 0,
  };
  const ids = translations.map(({ questionId }) => questionId);
  const optionLabels = new Map<string, string[]>();
  // Bounded batches keep each lookup well inside SQLite's parameter limit.
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    const [questions, options] = await Promise.all([
      prisma.question.findMany({ where: { id: { in: batch } }, select: { id: true } }),
      prisma.questionOption.findMany({ where: { questionId: { in: batch } }, select: { questionId: true, label: true }, orderBy: [{ questionId: "asc" }, { sortOrder: "asc" }] }),
    ]);
    for (const { id } of questions) optionLabels.set(id, []);
    for (const option of options) optionLabels.get(option.questionId)?.push(option.label);
  }
  const existing = await prisma.questionTranslation.findMany({ where: { locale }, select: { questionId: true, contentHash: true } });
  const existingHashes = new Map(existing.map((row) => [row.questionId, row.contentHash]));
  const kept = new Set<string>();
  const writes: Array<{ translation: TranslatedQuestion; hash: string; create: boolean }> = [];

  for (const translation of translations) {
    const labels = optionLabels.get(translation.questionId);
    if (labels === undefined) {
      summary.skippedMissingQuestion += 1;
      continue;
    }
    if (translation.options.map(({ label }) => label).join(",") !== labels.join(",")) {
      summary.skippedOptionMismatch += 1;
      continue;
    }
    kept.add(translation.questionId);
    const hash = translationHash(translation);
    const previous = existingHashes.get(translation.questionId);
    if (previous === hash) summary.unchanged += 1;
    else writes.push({ translation, hash, create: previous === undefined });
  }
  const stale = existing.filter(({ questionId }) => !kept.has(questionId)).map(({ questionId }) => questionId);
  summary.created = writes.filter(({ create }) => create).length;
  summary.updated = writes.length - summary.created;
  summary.removed = stale.length;
  if (options.dryRun || (!writes.length && !stale.length)) return summary;

  await prisma.$transaction(async (transaction) => {
    for (const { translation, hash } of writes) {
      const data = {
        stem: translation.stem,
        options: JSON.stringify(translation.options),
        explanation: translation.explanation,
        hints: JSON.stringify(translation.hints),
        contentHash: hash,
      };
      await transaction.questionTranslation.upsert({
        where: { questionId_locale: { questionId: translation.questionId, locale } },
        create: { questionId: translation.questionId, locale, ...data },
        update: data,
      });
    }
    if (stale.length) await transaction.questionTranslation.deleteMany({ where: { locale, questionId: { in: stale } } });
  }, { timeout: 120_000 });
  return summary;
}
