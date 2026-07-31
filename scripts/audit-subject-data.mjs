import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { contentDamageIssues } from "./amc-audit-rules.mjs";
import { localeFileUrl } from "./content-manifest.mjs";

const FILES = ["biology.json", "chemistry.json", "chinese.json", "chinese-high-school.json", "mathematics.json", "physics.json"];
const OPTION_KEYS = ["option_a", "option_b", "option_c", "option_d", "option_e"];
const PLACEHOLDER = /^(?:略|无|暂无|暂无解析|答案略|解析略|【答案】)[。.]?$/u;

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "").replace(/[。．;；]$/u, "");
}

function directLabels(value) {
  const cleaned = String(value ?? "")
    .replace(/\$|\\(?:rm|text|mathrm|mathbf)|[{}（）()\[\]]/gu, " ")
    .trim()
    .toUpperCase();
  const match = cleaned.match(/^(?:【?(?:答案|解答)】?[：:\s]*)?([A-E](?:[\s,，、;；|]*[A-E])*)[.。．]?$/u);
  return match ? [...new Set(match[1].match(/[A-E]/gu) ?? [])].sort() : [];
}

function terminalChoice(value) {
  const cleaned = String(value ?? "")
    .replace(/\$+/gu, "")
    .replace(/\\(?:rm|text|mathrm|mathbf)/gu, "")
    .replace(/[{}]/gu, "")
    .toUpperCase();
  const matches = [...cleaned.matchAll(/(?:故[选先]|答案(?:为|是)|正确答案(?:为|是)?|只有(?:选项)?)[：:\s]*([A-E](?:[、,，；;|和及\s]*[A-E])?)(?:项?正确)?(?=[。．.，,；;\s]|$)/gu)];
  if (!matches.length) return directLabels(value);
  return [...new Set(matches.at(-1)[1].match(/[A-E]/gu) ?? [])].sort();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isReviewableIssue(issue) {
  return /^(?:duplicate option|choice question lacks a direct answer key|answer key [A-E]+ references a missing option|answer conclusion [A-E]+ disagrees with key [A-E]+|solution_\d+ conclusion [A-E]+ disagrees with key [A-E]+)$/u.test(issue);
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
  const isChoice = /选择/u.test(String(question.type ?? ""));

  if (!/^[a-f0-9]{32}$/u.test(String(question.id ?? ""))) issues.push("invalid stable ID");
  if (ids.has(question.id)) issues.push("duplicate ID");
  ids.add(question.id);
  if (!stem) issues.push("missing stem");
  if (!answer || PLACEHOLDER.test(answer)) issues.push("missing or placeholder answer");
  if (!solutions.length || solutions.some((solution) => !solution || PLACEHOLDER.test(solution))) {
    issues.push("missing or placeholder solution");
  }

  const normalizedOptions = presentOptions.map(normalize);
  if (normalizedOptions.length !== new Set(normalizedOptions).size) issues.push("duplicate option");

  if (isChoice) {
    const key = directLabels(raw.answer1);
    if (!key.length) issues.push("choice question lacks a direct answer key");
    if (presentOptions.length && key.some((label) => !options[label.charCodeAt(0) - 65])) {
      issues.push(`answer key ${key.join("")} references a missing option`);
    }
    const answerChoice = terminalChoice(answer);
    if (key.length && answerChoice.length && key.join("") !== answerChoice.join("")) {
      issues.push(`answer conclusion ${answerChoice.join("")} disagrees with key ${key.join("")}`);
    }
    for (let index = 0; index < solutions.length; index += 1) {
      const solutionChoice = terminalChoice(solutions[index]);
      if (key.length && solutionChoice.length && key.join("") !== solutionChoice.join("")) {
        issues.push(`solution_${index} conclusion ${solutionChoice.join("")} disagrees with key ${key.join("")}`);
      }
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
