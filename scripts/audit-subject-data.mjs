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

function maskHalfOpenIntervals(str) {
  return str
    .replace(/\\left\([^()\[\]]*,[^()\[\]]*\\right\]/gu, (m) => "_".repeat(m.length))
    .replace(/\\left\[[^()\[\]]*,[^()\[\]]*\\right\)/gu, (m) => "_".repeat(m.length))
    .replace(/\[[^\[\]()]+[,，][^\[\]()]+\)/gu, (m) => "_".repeat(m.length))
    .replace(/\([^\[\]()]+[,，][^\[\]()]+[\]］]/gu, (m) => "_".repeat(m.length));
}

function isMathParenBalanced(body) {
  const s = maskHalfOpenIntervals(body)
    .replace(/\\left\s*[()]/g, "")
    .replace(/\\right\s*[()]/g, "");
  let d = 0;
  let minD = 0;
  for (const ch of s) {
    if (ch === "(") d++;
    else if (ch === ")") {
      d--;
      if (d < minD) minD = d;
    }
  }
  return d === 0 && minD === 0;
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
    if (
      ["现代文阅读", "诗歌鉴赏"].includes(question.type) &&
      !isChoice &&
      !/(?:（1）|_{2,}|[？?]|[A-D]\.|请|分析|赏析|概括|写出|说说|谈谈|理解|体会|说明|解释|翻译|画面|情感|作用|原因|好处|含义|特点|形象|探究|补全|修改|简述|批注|意象|手法|看法|理由|启示|感悟)/u.test(stem)
    ) {
      issues.push("stem: reading/poetry question lacks subquestion or prompt");
    }
  }
  if (question.type === "填空题" && !/_{2,}|[（(]\s*[）)]/u.test(stem)) {
    issues.push("stem: fill-in-the-blank question lacks blank marker");
  }
  if (
    filename === "chinese.json" &&
    question.type === "填空题" &&
    /[（(]1[）)][\s\S]*?[（(]2[）)]/u.test(stem) &&
    !/[（(][12][）)]/u.test(answer)
  ) {
    issues.push("answer: multi-part fill-in-the-blank question lacks numbered answer parts");
  }
  if (filename === "chinese.json" && ["略", "示例", "参考答案"].includes(answer.trim())) {
    issues.push("answer: placeholder answer text");
  }
  if (
    filename === "chinese.json" &&
    isChoice &&
    /字音和字形/u.test(stem) &&
    !/[①②③④]/u.test(stem) &&
    presentOptions.some((opt) => !/[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/iu.test(opt))
  ) {
    issues.push("options: pronunciation-and-orthography question option lacks pinyin annotation");
  }
  if (
    filename === "chinese.json" &&
    isChoice &&
    presentOptions.some((opt) => /；.*(?:选项|正确|错误|有误|应为|应改|符合题意|不合题意)/u.test(opt))
  ) {
    issues.push("options: option text contains explanatory semicolon clause");
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
    if (["biology.json", "chemistry.json", "mathematics.json", "physics.json"].includes(filename)) {
      const mathBlocks = [...String(value).matchAll(/\$\$([\s\S]*?)\$\$/gu)].map((m) => m[1]);
      if (mathBlocks.some((b) => !isMathParenBalanced(b))) {
        issues.push(`${field}: unbalanced parentheses inside math block`);
      }
      if (mathBlocks.some((b) => /^\s*\\[;,:!]/u.test(b))) {
        issues.push(`${field}: leading LaTeX spacing inside math block`);
      }
      if (mathBlocks.some((b) => /(?:故答案为|答案(?:为|是)[:：]?|故选[:：]?)/u.test(b))) {
        issues.push(`${field}: answer boilerplate trapped inside math block`);
      }
      if (mathBlocks.some((b) => /\\begin\{cases\}[\s\S]*?\\overset\{&\}[\s\S]*?\\end\{cases\}/u.test(b))) {
        issues.push(`${field}: corrupted \\overset{&} inside cases environment`);
      }
      if (
        mathBlocks.some((b) => {
          const withoutLegitCircled = b
            .replace(/\\begin\{(?:cases|array|matrix)\}[\s\S]*?\\end\{(?:cases|array|matrix)\}/gu, "")
            .replace(/(?:\\xlongequal|\\xrightarrow)(?:\[[^\]]*\])?\{[^{}]*\}/gu, "")
            .replace(/[_^]\s*\{?\s*[①-⑳]\s*\}?/gu, "");
          return /[①②③④⑤⑥⑦⑧⑨⑩]/u.test(withoutLegitCircled);
        })
      ) {
        issues.push(`${field}: trapped circled number inside math block`);
      }
      if (mathBlocks.some((b) => /[。]/u.test(b))) {
        issues.push(`${field}: Chinese period inside math block`);
      }
      if (
        mathBlocks.some(
          (b) =>
            /\(\s*(?:\\(?:quad|qquad|,|;|:|\s))*\s*\)\s*$/u.test(b) &&
            !/\\(?:d|t)?frac\{[^{}]*\}\{\(\s*(?:\\(?:quad|qquad|,|;|:|\s))*\s*\)\}/u.test(b),
        )
      ) {
        issues.push(`${field}: choice bracket trapped inside math block`);
      }
      if (mathBlocks.some((b) => /(?<!\{\}|\})[_^]\{\s*\}|\\(?:text|mathrm|rm)\{\s*\}/u.test(b))) {
        issues.push(`${field}: empty script or text group inside math block`);
      }
      if (mathBlocks.some((b) => /\\(?:d|t)?frac\{[^{}]+\}\{\s*\}/u.test(b))) {
        issues.push(`${field}: empty-denominator fraction arrow inside math block`);
      }
      if (
        isChoice &&
        solution &&
        /(?:故选|故答案选|答案选|应选|故选择|易错(?:点|选项)(?:为|是))[:：]?\s*\$\$(?:\\(?:rm|mathrm|text)\{\s*[A-F]{1,4}\s*\}|[A-F]{1,4})\$\$|(?:^|[解：:\n。．；;，,\s])\$\$(?:\\(?:rm|mathrm|text)\{\s*[A-F]{1,4}\s*\}|[A-F]{1,4})\$\$\s*(?:选项|项|说法正确|说法错误|说法不正确|正确|不正确|错误|符合题意|不符合题意)/u.test(
          String(value),
        )
      ) {
        issues.push(`${field}: wrapped option label inside choice solution`);
      }
      if (mathBlocks.some((b) => /^\s*(?:\\rm\{\s*)?[（(]\s*[Ⅰ-Ⅻⅰ-ⅻ]+\s*[)）]/u.test(b))) {
        issues.push(`${field}: Roman subquestion marker trapped inside math block`);
      }
      if (mathBlocks.some((b) => /\\sqrt\[\s*\]|[²³⁴₀₁₂₃₄]|\u2550|={2,}/u.test(b))) {
        issues.push(`${field}: malformed sqrt/super/subscript or box-drawing/doubled equals inside math block`);
      }
      if (mathBlocks.some((b) => /^\s*\{\}\s*\^\s*\{[^{}]+\}\s*$/u.test(b))) {
        issues.push(`${field}: detached standalone exponent math block`);
      }
      if (solution && /\n\d{1,2}\.\s*[（(]\d{4}[•·．.][^)）]+[)）]\s*$/u.test(String(value))) {
        issues.push(`${field}: trailing leaked next-question header in solution`);
      }
      if (
        field === "stem" &&
        /\(1\)/u.test(String(value)) &&
        mathBlocks.some((b) => /(?<![fFgGhHP][\x27′]?)(?<!_\{|\^\{)\([2-9]\d*\)/u.test(b))
      ) {
        issues.push(`${field}: trapped subquestion marker inside math block`);
      }
    }
    if (["biology.json", "chemistry.json", "mathematics.json", "physics.json", "chinese.json", "chinese-high-school.json"].includes(filename)) {
      if (field === "answer" && /^答[:：]/u.test(String(value))) {
        issues.push(`${field}: redundant 答： prefix`);
      }
      if (field === "stem" && question.type === "填空题" && !String(value).includes("______")) {
        issues.push(`${field}: 填空题 stem missing explicit ______ blank marker`);
      }
      if (filename === "chinese-high-school.json" && field === "stem" && /[（(]\s*[）)]\s*[A-D]\s*$/u.test(String(value))) {
        issues.push(`${field}: leaked answer letter at end of choice stem`);
      }
      const noSvg = String(value).replace(/<svg[\s\S]*?<\/svg>/giu, "");
      const noMath = noSvg.replace(/\$\$[\s\S]*?\$\$/gu, "MATH").replace(/\$[^$]+\$/gu, "MATH");
      if (/[０-９Ａ-Ｚａ-ｚ]/u.test(noSvg)) {
        issues.push(`${field}: fullwidth alphanumeric character`);
      }
      if (/\u2022/u.test(noSvg)) {
        issues.push(`${field}: bullet character • instead of middle dot ·`);
      }
      const sQuotes = noSvg.match(/[‘’]/gu) ?? [];
      if (sQuotes.length % 2 !== 0) {
        issues.push(`${field}: unbalanced Chinese single quotes`);
      } else {
        for (let i = 0; i < sQuotes.length; i += 2) {
          if (sQuotes[i] !== "‘" || sQuotes[i + 1] !== "’") {
            issues.push(`${field}: inverted Chinese single quotes`);
            break;
          }
        }
      }
      if (/(?:[，。；：、！？][,.;:!?]|[,.;:!?][，。；：、！？])/u.test(noMath)) {
        issues.push(`${field}: mixed adjacent CJK/ASCII punctuation`);
      }
      if (
        (filename === "chinese.json" || filename === "chinese-high-school.json") &&
        field === "stem" &&
        /(?:^\s*\d{1,2}\s*[．.、]\s*(?=[（(【\u4e00-\u9fa5“"《])|\n\s*\d{1,2}\s*[．.、]\s*(?=阅读|下列|根据|综合性|名著|古诗|文言|默写|阅读下面|某班|学校|班级|小[A-Z\u4e00-\u9fa5]{1,3}|[（(]\d+分[)）]))/u.test(noSvg)
      ) {
        issues.push(`${field}: leaked exam question number in stem`);
      }
      if (/(?:Error:|\[object Object\]|\bundefined\b|\bNaN\b)/u.test(noSvg)) {
        issues.push(`${field}: error/serialization artifact`);
      }
      if (/\u30fb|\{\{"\}\}/u.test(noSvg)) {
        issues.push(`${field}: Katakana middle dot or corrupted derivative`);
      }
      const quoteCheckText = noSvg
        .split("\n")
        .filter((line) => !line.includes("□") && !/^[A-D]\.\s*[，、；。？！“”\s]+$/u.test(line.trim()) && !/^“[^“”]+$/u.test(line.trim()))
        .join("\n");
      const quotes = quoteCheckText.match(/[“”]/gu) ?? [];
      if (quotes.length % 2 !== 0) {
        issues.push(`${field}: unbalanced Chinese double quotes`);
      } else {
        for (let i = 0; i < quotes.length; i += 2) {
          if (quotes[i] !== "“" || quotes[i + 1] !== "”") {
            issues.push(`${field}: inverted Chinese double quotes`);
            break;
          }
        }
      }
      if (/"/u.test(noMath)) {
        issues.push(`${field}: ASCII double quote outside SVG/math`);
      }
      if ((noMath.match(/（/gu) ?? []).length !== (noMath.match(/）/gu) ?? []).length) {
        issues.push(`${field}: unbalanced fullwidth parentheses`);
      }
      if ((noMath.match(/《/gu) ?? []).length !== (noMath.match(/》/gu) ?? []).length) {
        issues.push(`${field}: unbalanced book-title quotes`);
      }
      if ((noMath.match(/【/gu) ?? []).length !== (noMath.match(/】/gu) ?? []).length) {
        issues.push(`${field}: unbalanced lenticular brackets`);
      }
      if (
        filename === "chinese.json" &&
        field === "stem" &&
        question.type === "填空题" &&
        !stem.includes("_") &&
        /(?:（\s+）|\(\s+\))/u.test(noSvg)
      ) {
        issues.push(`${field}: invisible whitespace blank inside parentheses`);
      }
      if (/(?:[，。；：、]{2,}|？？+|，。|。，|[。！？]；|；[。，：]|：[；，。]|:；|，[；：]|？：|\.:\s*$|\$\$:\s*$)/u.test(String(value))) {
        issues.push(`${field}: doubled Chinese punctuation`);
      }
      if (/[（(]\s*(?:本小题满分)?\s*(?:\$\$)?\d+(?:\.\d+)?(?:\$\$)?\s*分\s*[）)]/u.test(String(value))) {
        issues.push(`${field}: inline grading score marker`);
      }
      if (
        /(?:【(?:试题解析|知识点|分析|详解|点睛|解答|答案|解析|考点|解题思路|名师点评|方法点拨|易错点|详解详析|技术的)】|\[(?:分析|详解|点睛|解答|答案|解析)(?:\$\$)?\]|名师点评本题考点：)/u.test(
          String(value),
        )
      ) {
        issues.push(`${field}: residual solution/meta tag`);
      }
      if (
        field === "stem" &&
        ["biology.json", "chemistry.json", "mathematics.json", "physics.json"].includes(filename) &&
        /(?<![（(][^）)\n]{0,12})(?:选填[“"‘']|填物态变化)/u.test(String(value))
      ) {
        issues.push(`${field}: unparenthesized fill-in prompt`);
      }
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
