import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  contentDamageIssues,
  directChoiceLabels,
  isChoiceQuestionType,
  terminalChoiceLabels,
} from "./amc-audit-rules.mjs";
import { hasCjevalSourceLabel } from "./cjeval.mjs";
import { localeFileUrl } from "./content-manifest.mjs";

const FILES = ["biology.json", "chemistry.json", "chinese.json", "chinese-high-school.json", "mathematics.json", "physics.json"];
const OPTION_LABELS = ["A", "B", "C", "D", "E"];
const PLACEHOLDER = /^(?:略|无|暂无|暂无解析|答案略|解析略|见答案|【答案】|【分析】|【解析】|【解答】)[。.]?$/u;
const LEGACY_SOLUTION_FALLBACK = /^(?:【(?:分析|解析|解答)】\s*)?(?:根据题目条件可得：|依据题干条件逐项判断，符合条件的是)/u;
const ENUMERATED_PLACEHOLDER = /(?:^|[\s；;。])(?:\d+[.、：:]|[（(]\d+[）)])\s*略(?=$|[\s；;。])/u;

function hasEnumeratedPlaceholders(value) {
  return ENUMERATED_PLACEHOLDER.test(String(value));
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "").replace(/[。．;；]$/u, "");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isReviewableIssue(issue) {
  return /^(?:missing or placeholder stem|duplicate option|choice question lacks a direct answer key|answer key [A-E]+ references a missing option|answer conclusion [A-E]+ disagrees with key [A-E]+|solution_\d+ conclusion [A-E]+ disagrees with key [A-E]+)$/u.test(issue);
}

const records = (await Promise.all(FILES.map(async (filename) => {
  const questions = JSON.parse((await readFile(localeFileUrl("zh-CN", filename), "utf8")).replace(/^\uFEFF/u, ""));
  return questions.map((question) => ({ filename, question }));
}))).flat();
const ids = new Set();
const fingerprints = new Map();
const invalid = [];
const quarantined = [];

for (const { filename, question } of records) {
  const options = OPTION_LABELS.map((label) => String(question.options?.[label] ?? "").trim());
  const presentOptions = options.filter(Boolean);
  const issues = [];
  const stem = String(question.stem ?? "").trim();
  const answer = String(question.answer ?? "").trim();
  const solutions = (question.solutions ?? []).map((solution) => String(solution ?? "").trim());
  const isChoice = isChoiceQuestionType(question.type);

  if (!/^[a-f0-9]{32}$/u.test(String(question.id ?? ""))) issues.push("invalid stable ID");
  if (ids.has(question.id)) issues.push("duplicate ID");
  ids.add(question.id);
  if (!stem || PLACEHOLDER.test(stem)) issues.push("missing or placeholder stem");
  if (/【题文】/u.test(stem)) issues.push("stem: source field label residue");
  if (!answer || PLACEHOLDER.test(answer)) issues.push("missing or placeholder answer");
  if (/^【(?:答案|解析|分析|详解|解答|点睛|点评)】/u.test(answer)) {
    issues.push("answer: leading bracket label residue");
  }
  if (!isChoice && question.type !== "填空题" && /^[A-E]{1,4}$/u.test(answer)) {
    issues.push("answer: bare option letters on non-choice question");
  }
  if (!solutions.length || solutions.some((solution) => !solution || PLACEHOLDER.test(solution))) {
    issues.push("missing or placeholder solution");
  }
  if (solutions.length !== new Set(solutions.map(normalize)).size) {
    issues.push("duplicate solution");
  }
  for (let index = 0; index < solutions.length; index += 1) {
    if (/^(?:【(?:答案|解析|分析|详解|解答|点睛|点评)】|试题分析[：:])/u.test(solutions[index])) {
      issues.push(`solution_${index}: leading label residue`);
    }
    if (LEGACY_SOLUTION_FALLBACK.test(solutions[index])) {
      issues.push(`solution_${index}: legacy fallback explanation`);
    }
    if (hasEnumeratedPlaceholders(solutions[index])) {
      issues.push(`solution_${index}: enumerated placeholder explanation`);
    }
  }
  if (filename === "chinese.json") {
    if (hasCjevalSourceLabel(stem)) {
      issues.push("stem: CJEval source label residue");
    }
    if (/选项[:：][^\n]|选择[:：]\s*[A-EＡ-Ｅ]\s*[.．、:：]/u.test(stem)) {
      issues.push("stem: inline CJEval option heading");
    }
    const stemMarkers = [...stem.matchAll(/(?:^|\n)（([1-9]\d*)）/gu)].map((match) => Number(match[1]));
    const ansMarkers = [...answer.matchAll(/(?:^|\n)（([1-9]\d*)）/gu)].map((match) => Number(match[1]));
    if (stemMarkers.length >= 2) {
      if (!stemMarkers.every((num, index) => num === index + 1)) {
        issues.push("stem: non-sequential CJEval subquestion numbering");
      }
      if (
        ansMarkers.length !== stemMarkers.length ||
        !ansMarkers.every((num, index) => num === index + 1)
      ) {
        issues.push("answer: CJEval subquestion answer count mismatch");
      }
    }
    const openLenticular = (stem.match(/【/gu) ?? []).length;
    const closeLenticular = (stem.match(/】/gu) ?? []).length;
    if (openLenticular !== closeLenticular) {
      issues.push("stem: unbalanced lenticular brackets");
    }
  }
  if (question.type === "填空题" && !/_{2,}|[（(]\s*[）)]/u.test(stem)) {
    issues.push("stem: fill-in-the-blank question lacks blank marker");
  }
  if (question.type === "判断题" && answer !== "√" && answer !== "×") {
    issues.push("answer: true/false question answer must be √ or ×");
  }
  if (!isChoice && Object.keys(question.options ?? {}).length > 0) {
    issues.push("options: non-choice question has unexpected options");
  }

  const normalizedOptions = presentOptions.map(normalize);
  if (normalizedOptions.length !== new Set(normalizedOptions).size) issues.push("duplicate option");

  if (isChoice) {
    if (presentOptions.length < 2) {
      issues.push("options: choice question has fewer than two options");
    }
    if (Object.entries(question.options ?? {}).some(([, val]) => !String(val ?? "").trim())) {
      issues.push("options: choice question has empty option text");
    }
    if (options.slice(0, presentOptions.length).some((opt) => !opt)) {
      issues.push("options: choice question has non-contiguous option keys");
    }
    const key = directChoiceLabels(question.answer);
    if (!key.length) issues.push("choice question lacks a direct answer key");
    if (/单选/u.test(String(question.type ?? "")) && key.length !== 1) {
      issues.push("single-choice answer key must contain exactly one option");
    }
    if (/(?:多选|双选)/u.test(String(question.type ?? "")) && key.length < 2) {
      issues.push("multiple-choice answer key must contain at least two options");
    }
    if (presentOptions.length && key.some((label) => !options[label.charCodeAt(0) - 65])) {
      issues.push(`answer key ${key.join("")} references a missing option`);
    }
    const answerChoice = terminalChoiceLabels(answer);
    if (key.length && answerChoice.length && key.join("") !== answerChoice.join("")) {
      issues.push(`answer conclusion ${answerChoice.join("")} disagrees with key ${key.join("")}`);
    }
    for (let index = 0; index < solutions.length; index += 1) {
      const solutionChoice = terminalChoiceLabels(solutions[index]);
      if (key.length && solutionChoice.length && key.join("") !== solutionChoice.join("")) {
        issues.push(`solution_${index} conclusion ${solutionChoice.join("")} disagrees with key ${key.join("")}`);
      }
    }
  }

  const fields = [
    ["stem", stem, false],
    ...options.map((value, index) => [`options.${OPTION_LABELS[index]}`, value, false]),
    ["answer", answer, false],
    ...solutions.map((value, index) => [`solution_${index}`, value, true]),
  ];
  for (const [field, value, solution] of fields) {
    for (const issue of contentDamageIssues(value, { solution })) issues.push(`${field}: ${issue}`);
    if ([...String(value).matchAll(/(?<!\\)\$/gu)].length % 2 !== 0) issues.push(`${field}: unbalanced math delimiters`);
    if (/<\/?(?:script|style|iframe|img|div|span|p|br)\b|&(?:nbsp|amp|lt|gt);/iu.test(String(value))) {
      issues.push(`${field}: raw HTML residue`);
    }
    if (/[\uE000-\uF8FF]/u.test(String(value))) {
      issues.push(`${field}: Private Use Area character residue`);
    }
    if (filename === "chinese.json" && /\\n|\\u[0-9a-fA-F]{4}/u.test(String(value))) {
      issues.push(`${field}: literal escape residue`);
    }
    if (filename === "chinese-high-school.json" && /学科网|版权所有|zxxk|21世纪教育|组卷网/iu.test(String(value))) {
      issues.push(`${field}: watermark residue`);
    }
    if (
      ["biology.json", "chemistry.json", "mathematics.json", "physics.json"].includes(filename) &&
      [...String(value).matchAll(/\$\$([\s\S]*?)\$\$/gu)].some((m) => /^[，。；：、！？]|[，。；：、！？]$/u.test(m[1]))
    ) {
      issues.push(`${field}: CJK punctuation inside math delimiter boundary`);
    }
  }

  const fingerprint = digest(normalize([stem, ...options].join("\n")));
  const previous = fingerprints.get(fingerprint);
  if (previous && previous.id !== question.id) {
    const duplicates = fingerprints.get("__duplicates__") ?? [];
    duplicates.push({ first: previous, duplicate: { filename, id: question.id } });
    fingerprints.set("__duplicates__", duplicates);
  } else {
    fingerprints.set(fingerprint, { filename, id: question.id });
  }
  const reviewReason = String(question.sourcePaper ?? "").match(/NEEDS_REVIEW[：:]\s*(.+)$/u)?.[1]?.trim();
  if (issues.length) {
    const uniqueIssues = [...new Set(issues)];
    const entry = { filename, id: question.id, issues: uniqueIssues };
    if (reviewReason && uniqueIssues.every(isReviewableIssue)) quarantined.push(entry);
    else invalid.push(entry);
  } else if (reviewReason) {
    quarantined.push({ filename, id: question.id, issues: [`source review marker: ${reviewReason}`] });
  }
}

const report = {
  files: Object.fromEntries(FILES.map((filename) => [filename, records.filter((record) => record.filename === filename).length])),
  total: records.length,
  uniqueIds: ids.size,
  exactDuplicateContent: fingerprints.get("__duplicates__") ?? [],
  quarantined,
  invalid,
};
console.log(JSON.stringify(report, null, 2));
if (invalid.length || report.exactDuplicateContent.length) process.exitCode = 1;
