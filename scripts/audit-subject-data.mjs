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
const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d", "option_e"];
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
  const raw = question.question_info?.raw_content ?? {};
  const options = OPTION_KEYS.map((key) => String(raw[key] ?? "").trim());
  const presentOptions = options.filter(Boolean);
  const issues = [];
  const stem = String(raw.title ?? "").trim();
  const answer = String(question.answer_info?.raw_content ?? "").trim();
  const solutions = (question.solution_info ?? []).map(({ solution_info }) => String(solution_info ?? "").trim());
  const isChoice = isChoiceQuestionType(question.type);

  if (!/^[a-f0-9]{32}$/u.test(String(question.id ?? ""))) issues.push("invalid stable ID");
  if (ids.has(question.id)) issues.push("duplicate ID");
  ids.add(question.id);
  if (!stem || PLACEHOLDER.test(stem)) issues.push("missing or placeholder stem");
  if (/【题文】/u.test(stem)) issues.push("title: source field label residue");
  if (!answer || PLACEHOLDER.test(answer)) issues.push("missing or placeholder answer");
  if (!solutions.length || solutions.some((solution) => !solution || PLACEHOLDER.test(solution))) {
    issues.push("missing or placeholder solution");
  }
  for (let index = 0; index < solutions.length; index += 1) {
    if (LEGACY_SOLUTION_FALLBACK.test(solutions[index])) {
      issues.push(`solution_${index}: legacy fallback explanation`);
    }
    if (hasEnumeratedPlaceholders(solutions[index])) {
      issues.push(`solution_${index}: enumerated placeholder explanation`);
    }
  }
  if (filename === "chinese.json") {
    if (hasCjevalSourceLabel(stem)) {
      issues.push("title: CJEval source label residue");
    }
    if (/选项[:：][^\n]|选择[:：]\s*[A-EＡ-Ｅ]\s*[.．、:：]/u.test(stem)) {
      issues.push("title: inline CJEval option heading");
    }
  }

  const normalizedOptions = presentOptions.map(normalize);
  if (normalizedOptions.length !== new Set(normalizedOptions).size) issues.push("duplicate option");

  if (isChoice) {
    const key = directChoiceLabels(raw.answer1);
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

  const childOrders = new Set();
  for (let index = 0; index < (question.children ?? []).length; index += 1) {
    const child = question.children[index];
    const childStem = String(child.title ?? "").trim();
    const childOptions = OPTION_KEYS.map((key) => String(child[key] ?? "").trim());
    const childPresentOptions = childOptions.filter(Boolean);
    const childKey = directChoiceLabels(child.answer1);
    if (!childStem || PLACEHOLDER.test(childStem)) issues.push(`child_${index}: missing or placeholder stem`);
    if (childPresentOptions.length) {
      if (childPresentOptions.length < 2) issues.push(`child_${index}: fewer than two options`);
      if (!childKey.length) issues.push(`child_${index}: missing direct answer key`);
      if (childKey.some((label) => !childOptions[label.charCodeAt(0) - 65])) {
        issues.push(`child_${index}: answer key ${childKey.join("")} references a missing option`);
      }
    } else if (!String(child.answer1 ?? "").trim() || PLACEHOLDER.test(String(child.answer1).trim())) {
      issues.push(`child_${index}: missing or placeholder answer`);
    }
    const normalizedChildOptions = childPresentOptions.map(normalize);
    if (normalizedChildOptions.length !== new Set(normalizedChildOptions).size) {
      issues.push(`child_${index}: duplicate option`);
    }
    if (childOrders.has(child.order)) issues.push(`child_${index}: duplicate order ${child.order}`);
    childOrders.add(child.order);
    for (const [field, value] of [
      ["title", childStem],
      ...childOptions.map((value, optionIndex) => [`option_${"abcde"[optionIndex]}`, value]),
      ["answer", child.answer1],
    ]) {
      for (const issue of contentDamageIssues(value)) issues.push(`child_${index}.${field}: ${issue}`);
    }
  }

  const fields = [
    ["title", stem, false],
    ...options.map((value, index) => [`option_${"abcde"[index]}`, value, false]),
    ["answer", answer, false],
    ...solutions.map((value, index) => [`solution_${index}`, value, true]),
  ];
  for (const [field, value, solution] of fields) {
    for (const issue of contentDamageIssues(value, { solution })) issues.push(`${field}: ${issue}`);
    if ([...String(value).matchAll(/(?<!\\)\$/gu)].length % 2 !== 0) issues.push(`${field}: unbalanced math delimiters`);
    if (/<\/?(?:script|style|iframe|img|div|span|p|br)\b|&(?:nbsp|amp|lt|gt);/iu.test(String(value))) {
      issues.push(`${field}: raw HTML residue`);
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
  const reviewReason = String(question.quality ?? "").match(/NEEDS_REVIEW[：:]\s*(.+)$/u)?.[1]?.trim();
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
if (invalid.length) process.exitCode = 1;
