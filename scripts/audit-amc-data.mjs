import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import {
  contentDamageIssues,
  normalizeOption,
  terminalLabeledChoice,
} from "./amc-audit-rules.mjs";
import { collection, localeFileUrl } from "./content-manifest.mjs";

const { files: FILES, sourceLocale: SOURCE_LOCALE } = collection("amc");

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function questionFingerprint(question) {
  const raw = question.question_info?.raw_content ?? {};
  return digest(normalize([
    raw.title,
    raw.option_a,
    raw.option_b,
    raw.option_c,
    raw.option_d,
    raw.option_e,
  ].join("\n")));
}

const records = (await Promise.all(FILES.map(async (filename) => {
  const questions = JSON.parse((await readFile(localeFileUrl(SOURCE_LOCALE, filename), "utf8")).replace(/^\uFEFF/, ""));
  return questions.map((question) => ({ filename, question }));
}))).flat();

const duplicateIds = Map.groupBy(records, ({ question }) => question.id);
const duplicateQuestions = Map.groupBy(records, ({ question }) => questionFingerprint(question));
const invalid = [];
const contestErrors = [];
const figureReferences = [];
const invalidFigureMarkers = [];

for (const { filename, question } of records) {
  const raw = question.question_info?.raw_content ?? {};
  const content = [
    raw.title,
    raw.option_a,
    raw.option_b,
    raw.option_c,
    raw.option_d,
    raw.option_e,
    ...(question.solution_info ?? []).map(({ solution_info: solution }) => solution),
  ];
  const solutionFingerprints = (question.solution_info ?? []).map(({ solution_info: solution }) => digest(normalize(solution)));
  const issues = [];
  for (const value of content) {
    for (const match of String(value).matchAll(/\[Figure:\s*([^\]\s]+)\]/g)) {
      const reference = match[1];
      figureReferences.push({ filename, id: question.id, reference });
      if (!/^\/question-assets\/source\/amc\/[a-f0-9]{64}\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(reference)) {
        invalidFigureMarkers.push({ filename, id: question.id, reference });
      }
    }
  }
  if (content.some((value) => !value)) issues.push("missing content");
  if (!/^[A-E]$/.test(raw.answer1 ?? "") || question.answer_info?.raw_content !== raw.answer1) issues.push("invalid answer key");
  const options = [raw.option_a, raw.option_b, raw.option_c, raw.option_d, raw.option_e];
  const normalizedOptions = options.map(normalizeOption);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) issues.push("duplicate option");
  if (solutionFingerprints.length !== new Set(solutionFingerprints).size) issues.push("duplicate solution");
  if (content.some((value) => /problems and solutions on this page are the property of the MAA/i.test(String(value)))) {
    issues.push("source attribution boilerplate");
  }
  if (content.some((value) => [...String(value).matchAll(/(?<!\\)\$/g)].length % 2 !== 0)) issues.push("unbalanced math");
  if (content.some((value) => /\[(?:asy|tikz)[\s\S]*?\[\/(?:asy|tikz)\]/i.test(value))) issues.push("unrendered figure source");
  const fields = [
    ["title", raw.title, false],
    ...options.map((value, index) => [`option_${"abcde"[index]}`, value, false]),
    ...(question.solution_info ?? []).map(({ solution_info: solution }, index) => [`solution_${index}`, solution, true]),
  ];
  for (const [field, value, solution] of fields) {
    for (const issue of contentDamageIssues(value, { solution })) issues.push(`${field}: ${issue}`);
  }
  for (let index = 0; index < (question.solution_info ?? []).length; index += 1) {
    const choice = terminalLabeledChoice(question.solution_info[index].solution_info);
    if (choice && choice !== raw.answer1) issues.push(`solution_${index}: terminal answer ${choice} disagrees with key ${raw.answer1}`);
  }
  if (issues.length) invalid.push({ filename, id: question.id, paper: question.paper, issues });
}

const localFigurePaths = [...new Set(figureReferences
  .map(({ reference }) => reference)
  .filter((reference) => reference.startsWith("/question-assets/source/amc/")))];
const missingFigureAssets = (await Promise.all(localFigurePaths.map(async (reference) => {
  try {
    await access(new URL(`../public${reference}`, import.meta.url));
    return null;
  } catch {
    return reference;
  }
}))).filter(Boolean);
const remoteFigureReferences = figureReferences.filter(({ reference }) => /^https?:\/\//i.test(reference));

const contestReferences = records.flatMap(({ filename, question }) => question.paper.split(" | ").map((paper) => ({ filename, paper })));
const contests = Map.groupBy(contestReferences, ({ paper }) => paper.split(" · Problem ")[0]);
for (const [contest, entries] of contests) {
  const slots = new Set(entries.map(({ paper }) => Number(paper.match(/Problem (\d+)/)?.[1])));
  if (entries.length !== 25 || slots.size !== 25) contestErrors.push({ contest, references: entries.length, slots: slots.size });
}

const crossFileDuplicateQuestions = [...duplicateQuestions.values()].filter((group) => (
  group.length > 1 && new Set(group.map(({ filename }) => filename)).size > 1
));
const report = {
  files: Object.fromEntries(FILES.map((filename) => [filename, records.filter((record) => record.filename === filename).length])),
  total: records.length,
  contestReferences: contestReferences.length,
  duplicateIds: [...duplicateIds.values()].filter((group) => group.length > 1).length,
  duplicateQuestionsWithinFiles: [...duplicateQuestions.values()].filter((group) => (
    group.length > 1 && new Set(group.map(({ filename }) => filename)).size === 1
  )).length,
  crossFileDuplicateQuestionGroups: crossFileDuplicateQuestions.length,
  crossFileDuplicateOccurrences: crossFileDuplicateQuestions.reduce((total, group) => total + group.length, 0),
  figureReferences: figureReferences.length,
  localFigureAssets: localFigurePaths.length,
  remoteFigureReferences,
  invalidFigureMarkers,
  missingFigureAssets,
  contestErrors,
  invalid,
};

console.log(JSON.stringify(report, null, 2));
if (
  report.duplicateIds
  || report.duplicateQuestionsWithinFiles
  || report.crossFileDuplicateQuestionGroups
  || report.remoteFigureReferences.length
  || report.invalidFigureMarkers.length
  || report.missingFigureAssets.length
  || report.contestErrors.length
  || report.invalid.length
) process.exitCode = 1;
