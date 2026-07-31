import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  AGIEVAL_COMMIT,
  AGIEVAL_OUTPUT_COUNT,
  AGIEVAL_SOURCE_SHA256,
} from "./agieval.mjs";
import { localeFileUrl } from "./content-manifest.mjs";

const filename = "chinese-high-school.json";
const questions = JSON.parse((await readFile(localeFileUrl("zh-CN", filename), "utf8")).replace(/^\uFEFF/u, ""));
const errors = [];
const ids = new Set();
const fingerprints = new Set();
const papers = new Set();
let merged = 0;

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "");
}

if (questions.length !== AGIEVAL_OUTPUT_COUNT) {
  errors.push(`expected ${AGIEVAL_OUTPUT_COUNT} questions, received ${questions.length}`);
}

for (const [index, question] of questions.entries()) {
  const location = `${filename}:${question.id ?? index}`;
  const raw = question.question_info?.raw_content ?? {};
  const options = [raw.option_a, raw.option_b, raw.option_c, raw.option_d].map((option) => String(option ?? "").trim());
  const label = String(raw.answer1 ?? "").trim();
  if (ids.has(question.id)) errors.push(`${location}: duplicate ID`);
  ids.add(question.id);
  if (question.course !== "语文" || question.grade_band !== "高中" || question.grade !== "高三" || question.type !== "单选题") {
    errors.push(`${location}: invalid subject, grade, or type mapping`);
  }
  if (options.some((option) => !option) || String(raw.option_e ?? "")) errors.push(`${location}: expected exactly four options`);
  if (!/^[A-D]$/u.test(label) || question.answer_info?.raw_content !== label) errors.push(`${location}: invalid answer key`);
  if (!String(question.solution_info?.[0]?.solution_info ?? "").includes(`参考答案为 ${label}`)) {
    errors.push(`${location}: missing explicit source-explanation boundary`);
  }
  if (!String(question.quality ?? "").includes(AGIEVAL_COMMIT) || !String(question.quality ?? "").includes(AGIEVAL_SOURCE_SHA256)) {
    errors.push(`${location}: missing pinned source provenance`);
  }
  const fingerprint = createHash("sha256").update(normalize([raw.title, ...options].join("\n"))).digest("hex");
  if (fingerprints.has(fingerprint)) errors.push(`${location}: duplicate normalized content`);
  fingerprints.add(fingerprint);
  for (const paper of String(question.paper ?? "").split("；同题亦见：")) if (paper) papers.add(paper);
  if (String(question.quality ?? "").includes("合并")) merged += 1;
}

if (papers.size !== 35) errors.push(`expected 35 source papers, received ${papers.size}`);
if (merged !== 19) errors.push(`expected 19 merged duplicate groups, received ${merged}`);

console.log(JSON.stringify({
  file: filename,
  questions: questions.length,
  uniqueIds: ids.size,
  sourcePapers: papers.size,
  mergedDuplicateGroups: merged,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
