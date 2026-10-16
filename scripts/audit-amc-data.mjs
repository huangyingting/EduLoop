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

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

function questionFingerprint(question) {
  const options = question.options ?? {};
  return digest(normalize([
    question.stem,
    ...OPTION_LABELS.map((label) => options[label]),
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
  const rawOptions = question.options ?? {};
  const options = OPTION_LABELS.map((label) => rawOptions[label]);
  const solutions = question.solutions ?? [];
  const content = [
    question.stem,
    ...options,
    ...solutions,
  ];
  const solutionFingerprints = solutions.map((solution) => digest(normalize(solution)));
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
  if (!/^[A-E]$/.test(question.answer ?? "")) issues.push("invalid answer key");
  const normalizedOptions = options.map(normalizeOption);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) issues.push("duplicate option");
  if (solutionFingerprints.length !== new Set(solutionFingerprints).size) issues.push("duplicate solution");
  if (content.some((value) => /problems and solutions on this page are the property of the MAA/i.test(String(value)))) {
    issues.push("source attribution boilerplate");
  }
  if (content.some((value) => [...String(value).matchAll(/(?<!\\)\$/g)].length % 2 !== 0)) issues.push("unbalanced math");
  if (content.some((value) => /\[(?:asy|tikz)[\s\S]*?\[\/(?:asy|tikz)\]/i.test(value))) issues.push("unrendered figure source");
  const fields = [
    ["stem", question.stem, false],
    ...options.map((value, index) => [`options.${OPTION_LABELS[index]}`, value, false]),
    ...solutions.map((solution, index) => [`solution_${index}`, solution, true]),
  ];
  for (const [field, value, solution] of fields) {
    for (const issue of contentDamageIssues(value, { solution })) issues.push(`${field}: ${issue}`);
  }
  for (let index = 0; index < solutions.length; index += 1) {
    const choice = terminalLabeledChoice(solutions[index]);
    if (choice && choice !== question.answer) issues.push(`solution_${index}: terminal answer ${choice} disagrees with key ${question.answer}`);
  }
  if (issues.length) invalid.push({ filename, id: question.id, sourcePaper: question.sourcePaper, issues });
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

const contestReferences = records.flatMap(({ filename, question }) => question.sourcePaper.split(" | ").map((sourcePaper) => ({ filename, paper: sourcePaper })));
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
