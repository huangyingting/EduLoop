import { DEFAULT_LOCALE, requestLocale, type Locale } from "@/i18n/config";
import { prisma } from "@/lib/prisma";

export type QuestionText = {
  stem: string;
  options: Map<string, string>;
  explanation: string | null;
  hints: string[];
};

// The content language for a request: the interface language when it is not
// the catalog's default, otherwise null (serve the stored question as is).
export function contentLocale(request: Request): Locale | null {
  const locale = requestLocale(request);
  return locale === DEFAULT_LOCALE ? null : locale;
}

function parseList<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export async function questionTranslations(questionIds: string[], locale: Locale | null) {
  const translations = new Map<string, QuestionText>();
  if (!locale || !questionIds.length) return translations;
  const rows = await prisma.questionTranslation.findMany({
    where: { locale, questionId: { in: [...new Set(questionIds)] } },
    select: { questionId: true, stem: true, options: true, explanation: true, hints: true },
  });
  for (const row of rows) {
    translations.set(row.questionId, {
      stem: row.stem,
      options: new Map(parseList<{ label: string; content: string }>(row.options).map(({ label, content }) => [label, content])),
      explanation: row.explanation,
      hints: parseList<string>(row.hints).filter((hint) => typeof hint === "string"),
    });
  }
  return translations;
}

export async function questionTranslation(questionId: string, locale: Locale | null) {
  return (await questionTranslations([questionId], locale)).get(questionId) ?? null;
}

// Replaces the stem of each item with its translation when one exists,
// optionally cut to the same excerpt length as the stored stems.
export async function localizeStems<T extends { id: string; stem: string }>(items: T[], locale: Locale | null, excerptLength?: number): Promise<T[]> {
  const translations = await questionTranslations(items.map(({ id }) => id), locale);
  if (!translations.size) return items;
  return items.map((item) => {
    const translation = translations.get(item.id);
    if (!translation) return item;
    const stem = excerptLength && translation.stem.length > excerptLength ? `${translation.stem.slice(0, excerptLength)}…` : translation.stem;
    return { ...item, stem };
  });
}

type ContestPaperContent = { questions: Array<{ questionId: string; stem: string; options: Array<{ label: string; content: string }> }> };
type ContestResultContent = { problems: Array<{ questionId: string; stem: string; explanation: string | null }> };

// Contest papers and results show each problem in the content language when a
// translation exists; scoring always uses the stored answer key.
export async function localizeContestView<T extends ContestPaperContent | ContestResultContent>(view: T, locale: Locale | null): Promise<T> {
  if (!locale) return view;
  if ("questions" in view) {
    const translations = await questionTranslations(view.questions.map(({ questionId }) => questionId), locale);
    return { ...view, questions: view.questions.map((question) => {
      const translation = translations.get(question.questionId);
      if (!translation) return question;
      return { ...question, stem: translation.stem, options: question.options.map((option) => ({ ...option, content: translation.options.get(option.label) ?? option.content })) };
    }) };
  }
  const translations = await questionTranslations(view.problems.map(({ questionId }) => questionId), locale);
  return { ...view, problems: view.problems.map((problem) => {
    const translation = translations.get(problem.questionId);
    return translation ? { ...problem, stem: translation.stem, explanation: translation.explanation ?? problem.explanation } : problem;
  }) };
}
