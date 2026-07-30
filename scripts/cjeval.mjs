import { createHash } from "node:crypto";

export const CJEVAL_COMMIT = "590fb8f34239f642324b806b68374c303fe643bf";

export const CJEVAL_SPLITS = Object.freeze([
  { name: "train", count: 1_986, sha256: "8b2c61f2ff260744e211341cb4b116659c5a6e4657c3a51f6a66517d7ba28e44" },
  { name: "valid", count: 191, sha256: "6f842098d8f47e2d778060d98d57f81fffd864a5ce645b9633706e3b3ff77c28" },
  { name: "test", count: 322, sha256: "1574042343d32a54475ff769950d3c75562ee756a10f5ecfa84f00cf1b3f51e8" },
]);

const EMPHASIS_TAGS = ["dotted", "dot", "u", "underline", "underlined"];
const STRONG_TAGS = ["b", "bold", "strong", "mark"];
const TRANSPARENT_TAGS = ["span", "a", "i", "small"];
const FULL_WIDTH_A = "Ａ".codePointAt(0);

function normalizeOptionLabel(label) {
  const codePoint = label.toUpperCase().codePointAt(0);
  return codePoint >= FULL_WIDTH_A && codePoint <= FULL_WIDTH_A + 4
    ? String.fromCodePoint(codePoint - 0xfee0)
    : label.toUpperCase();
}

function replacePairedTags(value, tags, replacement) {
  let result = value;
  for (const tag of tags) {
    result = result.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "giu"), replacement);
  }
  return result;
}

export function normalizeCjevalText(value) {
  let result = String(value ?? "").normalize("NFC");
  result = result
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/\((\/?(?:dotted|dot|u|underline|underlined))\)/giu, "<$1>")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
  result = replacePairedTags(result, EMPHASIS_TAGS, "【$1】");
  result = replacePairedTags(result, STRONG_TAGS, "【$1】");
  result = replacePairedTags(result, ["sup"], "（上标：$1）");
  result = replacePairedTags(result, TRANSPARENT_TAGS, "$1");
  result = result.replace(/<\/?(?:dotted|dot|u|underline|underlined|b|bold|strong|mark|sup|span|a|i|small)(?:\s[^>]*)?>/giu, "");
  result = result.replace(/<点>([\s\S]*?)<点>/gu, "【$1】").replace(/<([^<>\n]+)>/gu, "〈$1〉");
  return result.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function formatCjevalContent(value) {
  if (typeof value === "string") return normalizeCjevalText(value);
  if (Array.isArray(value)) return value.map((item) => formatCjevalContent(item)).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const title = formatCjevalContent(value["题目内容"] ?? value.question ?? "");
    const options = value["选项"] ?? value.options;
    if (title && Array.isArray(options)) return `${title}\n选项：${formatCjevalContent(options)}`;
    return Object.entries(value).map(([key, item]) => `${key}：${formatCjevalContent(item)}`).join("\n");
  }
  return normalizeCjevalText(value);
}

export function splitChoiceContent(value) {
  const content = formatCjevalContent(value);
  const markerPattern = /(?:^|[\s\u3000：:。；;，,）)])([A-EＡ-Ｅ])\s*[.．、:：]/giu;
  const markers = [...content.matchAll(markerPattern)].map((match) => {
    const matchStart = match.index ?? 0;
    const labelOffset = match[0].lastIndexOf(match[1]);
    return {
      label: normalizeOptionLabel(match[1]),
      start: matchStart + labelOffset,
      end: matchStart + match[0].length,
    };
  });
  if (markers.length < 2 || markers.length > 5) return null;
  const labels = markers.map((marker) => marker.label);
  if (new Set(labels).size !== labels.length) return null;
  if ([...labels].sort().some((label, index) => label !== String.fromCharCode(65 + index))) return null;
  const options = markers.map((marker, index) => ({
    label: marker.label,
    content: content.slice(marker.end, markers[index + 1]?.start ?? content.length).trim(),
  })).sort((left, right) => left.label.localeCompare(right.label));
  if (options.some((option) => !option.content)) return null;
  const stem = content.slice(0, markers[0].start).replace(/(?:选项|选项是)\s*[：:]?\s*$/u, "").trim();
  return stem ? { stem, options } : null;
}

function formatAnswerPart(value, depth) {
  if (typeof value === "string") return normalizeCjevalText(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const prefix = depth === 0 ? `（${index + 1}）` : `${index + 1}. `;
      return `${prefix}${formatAnswerPart(item, depth + 1)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${key}. ${formatAnswerPart(item, depth + 1)}`).join("\n");
  }
  return String(value ?? "");
}

export function formatCjevalAnswer(value) {
  if (!Array.isArray(value)) return formatAnswerPart(value, 0);
  if (value.length === 1 && typeof value[0] === "string") return normalizeCjevalText(value[0]);
  return formatAnswerPart(value, 0);
}

function stableId(split, index) {
  return createHash("sha256").update(`cjeval:${CJEVAL_COMMIT}:初中语文:${split}:${index}`).digest("hex").slice(0, 32);
}

function knowledgeTag(label) {
  const normalized = normalizeCjevalText(label);
  return {
    dimension: "TOPIC",
    slug: `cjeval-${createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`,
    label: normalized,
    confidence: 1,
    source: "IMPORT",
  };
}

function mapDifficulty(value) {
  if (value === "容易" || value === "较易") return "容易";
  if (value === "较难" || value === "困难") return "困难";
  return "一般";
}

export function convertCjevalRecord(record, split, index) {
  const answer = formatCjevalAnswer(record.ques_answer);
  const explanation = normalizeCjevalText(record.ques_analyze);
  const choiceAnswers = record.ques_type === "选择题"
    && Array.isArray(record.ques_answer)
    && record.ques_answer.length > 0
    && record.ques_answer.every((item) => typeof item === "string" && /^[A-E]$/u.test(item))
    ? [...new Set(record.ques_answer)]
    : [];
  const parsedChoice = choiceAnswers.length ? splitChoiceContent(record.ques_content) : null;
  const isGradableChoice = choiceAnswers.length > 0 && Boolean(parsedChoice);
  const issues = [];
  if (record.ques_type === "选择题" && !choiceAnswers.length) issues.push("复合选择题需要人工确认作答结构");
  if (choiceAnswers.length && !parsedChoice) issues.push("选择题选项无法安全拆分");
  if (parsedChoice && choiceAnswers.some((answerLabel) => !parsedChoice.options.some((option) => option.label === answerLabel))) {
    issues.push("答案引用了不存在的选项");
  }
  if (JSON.stringify(record.ques_content).includes("<点>")) issues.push("来源含无法可靠解释的加点标记");
  const normalizedOptions = parsedChoice?.options.map((option) => option.content.replace(/\s+/gu, "")) ?? [];
  if (new Set(normalizedOptions).size !== normalizedOptions.length) issues.push("选择题包含重复选项");
  if (split === "train" && index === 0) issues.push("来源首题的读音答案与解析疑似冲突");

  const optionByLabel = new Map(parsedChoice?.options.map((option) => [option.label, option.content]) ?? []);
  const answerKey = isGradableChoice ? choiceAnswers.join("|") : "";
  const quality = issues.length
    ? `CJEval许可导入；NEEDS_REVIEW：${issues.join("；")}`
    : "CJEval许可导入";

  return {
    id: stableId(split, index),
    type: isGradableChoice ? choiceAnswers.length > 1 ? "多选题" : "单选题" : record.ques_type === "选择题" ? "复合题" : record.ques_type,
    grade_band: "初中",
    difficulty: mapDifficulty(record.ques_difficulty),
    grade: "初中综合",
    course: "语文",
    paper: `CJEval ${split} #${index + 1}；原始难度：${record.ques_difficulty}`,
    online_test: true,
    option_split: Boolean(parsedChoice),
    quality,
    question_info: {
      raw_content: {
        title: parsedChoice?.stem ?? formatCjevalContent(record.ques_content),
        option_a: optionByLabel.get("A") ?? "",
        option_b: optionByLabel.get("B") ?? "",
        option_c: optionByLabel.get("C") ?? "",
        option_d: optionByLabel.get("D") ?? "",
        option_e: optionByLabel.get("E") ?? "",
        answer1: answerKey,
      },
    },
    answer_info: { raw_content: answer },
    solution_info: [{ solution_info: explanation }],
    children: [],
    source_tags: [...new Set(record.ques_knowledges.map((item) => normalizeCjevalText(item)).filter(Boolean))].map(knowledgeTag),
  };
}
