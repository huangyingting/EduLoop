import { createHash } from "node:crypto";

export const AGIEVAL_COMMIT = "84ab72d94318290aad2e4ec820d535a95a1f7552";
export const AGIEVAL_SOURCE_PATH = "data/v1_1/gaokao-chinese.jsonl";
export const AGIEVAL_SOURCE_SHA256 = "1ddcf8fa15e07a25589796dc1c72a341c2d874af8de41970262d66693f95285f";
export const AGIEVAL_SOURCE_COUNT = 246;
export const AGIEVAL_OUTPUT_COUNT = 227;

const EXPECTED_KEYS = ["answer", "label", "options", "other", "passage", "question"];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAgievalText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/(?<!_)__([^_\n]+)__(?!_)/gu, "$1")
    .replace(/(材料[一二三四五六七八九十\d]+[：:])。/gu, "$1")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function stripAgievalOptionLabel(value) {
  return normalizeAgievalText(value).replace(/^\s*[（(]\s*[A-DＡ-Ｄ]\s*[）)]\s*/u, "").trim();
}

function validateRecord(record, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`AGIEval row ${index + 1} must be an object`);
  }
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_KEYS)) {
    throw new Error(`AGIEval row ${index + 1} has unexpected keys: ${keys.join(", ")}`);
  }
  if (record.passage !== null && typeof record.passage !== "string") {
    throw new Error(`AGIEval row ${index + 1} passage must be a string or null`);
  }
  if (typeof record.question !== "string" || !record.question.trim()) {
    throw new Error(`AGIEval row ${index + 1} is missing a question`);
  }
  if (!Array.isArray(record.options) || record.options.length !== 4 || record.options.some((option) => typeof option !== "string" || !option.trim())) {
    throw new Error(`AGIEval row ${index + 1} must contain four non-empty options`);
  }
  if (typeof record.label !== "string" || !/^[A-D]$/u.test(record.label)) {
    throw new Error(`AGIEval row ${index + 1} has an invalid answer label`);
  }
  if (record.answer !== null) {
    throw new Error(`AGIEval row ${index + 1} has an unexpected cloze answer`);
  }
  if (!record.other || typeof record.other !== "object" || Array.isArray(record.other) || typeof record.other.source !== "string" || !record.other.source.trim()) {
    throw new Error(`AGIEval row ${index + 1} is missing source-paper provenance`);
  }
}

export function parseAgievalJsonl(source) {
  const lines = String(source).replace(/^\uFEFF/u, "").split(/\r?\n/gu).filter((line) => line.trim());
  if (lines.length !== AGIEVAL_SOURCE_COUNT) {
    throw new Error(`AGIEval source expected ${AGIEVAL_SOURCE_COUNT} rows, received ${lines.length}`);
  }
  return lines.map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`AGIEval row ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    validateRecord(record, index);
    return record;
  });
}

function fingerprint(record) {
  const fields = [record.passage ?? "", record.question, ...record.options.map(stripAgievalOptionLabel)];
  const normalized = fields.map((value) => normalizeAgievalText(value).normalize("NFKC").replace(/\s+/gu, ""));
  return digest(normalized.join("\n"));
}

function stableId(sourceIndex) {
  return digest(`agieval:v1.1:gaokao-chinese:${sourceIndex}`).slice(0, 32);
}

function convertGroup(group) {
  const { record, sourceIndex, sources } = group;
  const passage = normalizeAgievalText(record.passage);
  const question = normalizeAgievalText(record.question);
  const options = record.options.map(stripAgievalOptionLabel);
  const optionByLabel = new Map(options.map((option, index) => [String.fromCharCode(65 + index), option]));
  const paper = sources.join("；同题亦见：");
  const duplicateNote = sources.length > 1 ? `；合并 ${sources.length} 个内容完全相同的试卷来源` : "";
  const skillTag = passage
    ? { dimension: "SKILL", slug: "reading-comprehension", label: "阅读理解", confidence: 0.9, source: "IMPORT" }
    : { dimension: "SKILL", slug: "language-application", label: "语言运用", confidence: 0.85, source: "IMPORT" };

  return {
    id: stableId(sourceIndex),
    type: "单选题",
    grade_band: "高中",
    difficulty: "一般",
    grade: "高三",
    course: "语文",
    paper,
    online_test: true,
    option_split: true,
    quality: `AGIEval v1.1 MIT许可导入；固定提交 ${AGIEVAL_COMMIT}；源文件SHA-256 ${AGIEVAL_SOURCE_SHA256}${duplicateNote}`,
    question_info: {
      raw_content: {
        title: passage ? `${passage}\n\n${question}` : question,
        option_a: optionByLabel.get("A") ?? "",
        option_b: optionByLabel.get("B") ?? "",
        option_c: optionByLabel.get("C") ?? "",
        option_d: optionByLabel.get("D") ?? "",
        option_e: "",
        answer1: record.label,
      },
    },
    answer_info: { raw_content: record.label },
    solution_info: [{ solution_info: `AGIEval v1.1 原始数据未提供解析。参考答案为 ${record.label}。` }],
    children: [],
    source_tags: [
      { dimension: "TOPIC", slug: "gaokao-chinese", label: "高考语文", confidence: 1, source: "IMPORT" },
      skillTag,
    ],
  };
}

export function convertAgievalRecords(records) {
  const groups = new Map();
  records.forEach((record, index) => {
    validateRecord(record, index);
    const key = fingerprint(record);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { record, sourceIndex: index, sources: [record.other.source] });
      return;
    }
    if (existing.record.label !== record.label) {
      throw new Error(`AGIEval duplicate rows ${existing.sourceIndex + 1} and ${index + 1} disagree on the answer`);
    }
    if (!existing.sources.includes(record.other.source)) existing.sources.push(record.other.source);
  });

  const questions = [...groups.values()].map(convertGroup);
  if (records.length === AGIEVAL_SOURCE_COUNT && questions.length !== AGIEVAL_OUTPUT_COUNT) {
    throw new Error(`AGIEval conversion expected ${AGIEVAL_OUTPUT_COUNT} unique questions, received ${questions.length}`);
  }
  return questions;
}
