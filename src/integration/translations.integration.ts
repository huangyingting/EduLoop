import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getHint } from "@/app/api/questions/hint/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { importTranslations, normalizeTranslatedQuestion } from "@/lib/catalog-translations";
import { prisma } from "@/lib/prisma";
import { createCatalogFixture, createChoiceQuestion, integrationHeaders, jsonRequest, type CatalogFixture } from "./fixtures";

const prefix = "translation-flow";
const translatedId = `${prefix}-translated`;
const untranslatedId = `${prefix}-untranslated`;
const english = { cookie: "eduloop-locale=en" };
let catalog: CatalogFixture;

function englishSource(id: string, options: Record<string, string>) {
  return {
    id, subject: "数学", grade: "AMC-8", type: "单选题", difficulty: "容易", sourcePaper: "2000 AMC 8 · Problem 1",
    stem: `${id}: What is $1+1$?`, options, answer: "B",
    solutions: ["Count the two objects one at a time, so the total is $2$."], tags: [],
  };
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  await createChoiceQuestion(catalog, translatedId);
  await createChoiceQuestion(catalog, untranslatedId);
});

afterAll(async () => {
  await catalog.cleanup();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("translated question content", () => {
  it("imports translations incrementally and skips mismatched options or unknown questions", async () => {
    const translations = [
      normalizeTranslatedQuestion(englishSource(translatedId, { A: "1", B: "2" }), "en", "amc8.json")!,
      normalizeTranslatedQuestion(englishSource(untranslatedId, { A: "1", B: "2", C: "3" }), "en", "amc8.json")!,
      normalizeTranslatedQuestion(englishSource(`${prefix}-missing`, { A: "1", B: "2" }), "en", "amc8.json")!,
    ];
    expect(translations[0].hints).toEqual(["Start here: Count the two objects one at a time…"]);
    expect(await importTranslations(prisma, "en", translations)).toMatchObject({ created: 1, skippedOptionMismatch: 1, skippedMissingQuestion: 1 });
    expect(await importTranslations(prisma, "en", translations)).toMatchObject({ created: 0, unchanged: 1 });
  });

  it("serves the translation in English, prefers translated questions, and keeps grading on the stored key", async () => {
    const english1 = await nextQuestion(new NextRequest(`http://localhost/api/questions/next?subject=${prefix}-subject`, { headers: { ...integrationHeaders, ...english } }));
    const served = await english1.json();
    expect(served).toMatchObject({ id: translatedId, language: "en", stem: `${translatedId}: What is $1+1$?`, hintCount: 1 });

    const chinese = await (await nextQuestion(new NextRequest(`http://localhost/api/questions/next?questionId=${translatedId}`, { headers: integrationHeaders }))).json();
    expect(chinese).toMatchObject({ language: "zh-CN", stem: `${translatedId}：1 + 1 等于？` });

    const hint = await (await getHint(new NextRequest(`http://localhost/api/questions/hint?questionId=${translatedId}&step=0`, { headers: { ...integrationHeaders, ...english } }))).json();
    expect(hint).toMatchObject({ kind: "HINT", hint: "Start here: Count the two objects one at a time…" });

    const graded = await (await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", { questionId: translatedId, response: ["B"], ticket: served.ticket }, undefined, english))).json();
    expect(graded).toMatchObject({ isCorrect: true, explanation: "Count the two objects one at a time, so the total is $2$." });
  });

  it("falls back to default-language questions when nothing translated matches", async () => {
    const response = await nextQuestion(new NextRequest(`http://localhost/api/questions/next?subject=${prefix}-subject&questionId=${untranslatedId}`, { headers: { ...integrationHeaders, ...english } }));
    expect(await response.json()).toMatchObject({ id: untranslatedId, language: "zh-CN" });
  });

  it("removes translations whose source records disappear", async () => {
    // A private locale keeps this test away from any seeded English rows.
    const translation = normalizeTranslatedQuestion(englishSource(translatedId, { A: "1", B: "2" }), "x-test", "amc8.json")!;
    expect(await importTranslations(prisma, "x-test", [translation])).toMatchObject({ created: 1 });
    expect(await importTranslations(prisma, "x-test", [])).toMatchObject({ removed: 1 });
    expect(await prisma.questionTranslation.count({ where: { locale: "x-test" } })).toBe(0);
  });
});
