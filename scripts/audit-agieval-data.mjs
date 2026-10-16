import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE,
  AGIEVAL_COMMIT,
  AGIEVAL_OUTPUT_COUNT,
  AGIEVAL_REPAIRED_OUTPUT_COUNT,
  AGIEVAL_REPAIR_COUNT,
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
let repaired = 0;

const AUTHORITATIVE_YANZI_OPTIONS = new Map([
  ["6c43670e2070a2b023e2d445f9e64b5e", ["子何绝我之暴也 暴：暴躁", "士者诎乎不知己 诎：屈从", "请鬻于世 鬻：卖", "免人于厄 厄：困境"]],
  ["98f6d58efd94084b5189b0419c4e9438", ["①因载而与之俱归 ②以其求思之深而无不在也", "①吾乃今日睹而赎之 ②山东豪俊遂并起而亡秦族矣", "①而申乎知己 ②胡为乎遑遑欲何之", "①故君子不以功轻人之身 ②秦亦不以城予赵"]],
  ["1bf0c08fe07b187017ec04b90a234984", ["晏子前往晋国，在途中遇到了越石父，替他赎身，可见晏子善于识别人才，爱护人才。", "越石父认为晏子对自己失礼，仍把他当奴仆，十分生气，说明他态度偏激，心胸狭窄。", "晏子听了越石父的一番话后，深感愧疚，就以宾礼相待，这使越石父颇受感动。", "君子认为，晏子能远离世俗的偏见，礼贤下士，不居功自傲，这样就可以保全功德了。"]],
]);

const AUTHORITATIVE_GO_IDS = new Set([
  "bf3e24a26ae2700d53a5e08b1d598a32",
  "a75fe39ecc9c54ec8838244576b307d2",
  "192dcb49c3c7960b4db276bfa2992cfa",
]);
const DAMAGED_GO_TEXT = /源头想符|围棋的产生围棋的产生|介于赌博|他们不符合我们民族|地位在与传统礼教|传动伦理|认识别这些观念|精神宣寄/u;

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "");
}

if (questions.length !== AGIEVAL_OUTPUT_COUNT) {
  errors.push(`expected ${AGIEVAL_OUTPUT_COUNT} questions, received ${questions.length}`);
}

for (const [index, question] of questions.entries()) {
  const location = `${filename}:${question.id ?? index}`;
  const rawOptions = question.options ?? {};
  const options = ["A", "B", "C", "D"].map((label) => String(rawOptions[label] ?? "").trim());
  const label = String(question.answer ?? "").trim();
  const sourcePaper = String(question.sourcePaper ?? "");
  if (ids.has(question.id)) errors.push(`${location}: duplicate ID`);
  ids.add(question.id);
  if (question.subject !== "语文" || question.grade !== "高三" || question.type !== "单选题") {
    errors.push(`${location}: invalid subject, grade, or type mapping`);
  }
  if (options.some((option) => !option) || String(rawOptions.E ?? "")) errors.push(`${location}: expected exactly four options`);
  if (!/^[A-D]$/u.test(label)) errors.push(`${location}: invalid answer key`);
  if (!String(question.solutions?.[0] ?? "").includes(`参考答案为 ${label}`)) {
    errors.push(`${location}: missing explicit source-explanation boundary`);
  }
  if (!sourcePaper.includes(AGIEVAL_COMMIT) || !sourcePaper.includes(AGIEVAL_SOURCE_SHA256)) {
    errors.push(`${location}: missing pinned source provenance`);
  }
  const fingerprint = createHash("sha256").update(normalize([question.stem, ...options].join("\n"))).digest("hex");
  if (fingerprints.has(fingerprint)) errors.push(`${location}: duplicate normalized content`);
  fingerprints.add(fingerprint);
  const basePaper = sourcePaper.replace(/（AGIEval v1\.1[\s\S]*$/u, "");
  for (const paper of basePaper.split("；同题亦见：")) if (paper) papers.add(paper);
  if (sourcePaper.includes("合并")) merged += 1;
  if (sourcePaper.includes("EduLoop人工校订")) repaired += 1;
  const authoritativeOptions = AUTHORITATIVE_YANZI_OPTIONS.get(question.id);
  if (authoritativeOptions) {
    if (!String(question.stem ?? "").startsWith(`${AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE}\n\n`)) {
      errors.push(`${location}: authoritative Yanzi passage repair is missing`);
    }
    if (JSON.stringify(options) !== JSON.stringify(authoritativeOptions)) {
      errors.push(`${location}: authoritative Yanzi option repair is missing`);
    }
  }
  if (AUTHORITATIVE_GO_IDS.has(question.id)) {
    if (DAMAGED_GO_TEXT.test(String(question.stem ?? ""))) {
      errors.push(`${location}: damaged Go passage text remains`);
    }
    if (!String(question.stem ?? "").includes("源头相符")
      || !String(question.stem ?? "").includes("围棋的产生和发展")
      || !String(question.stem ?? "").includes("宜于赌博")
      || !String(question.stem ?? "").includes("精神寄托的工具")) {
      errors.push(`${location}: authoritative Go passage repair is incomplete`);
    }
    if (question.id === "a75fe39ecc9c54ec8838244576b307d2"
      && (!options[0].includes("群体心理") || !options[2].includes("艺技"))) {
      errors.push(`${location}: authoritative Go option repairs are missing`);
    }
    if (question.id === "192dcb49c3c7960b4db276bfa2992cfa" && !options[3].includes("国艺价值观")) {
      errors.push(`${location}: authoritative Go option repair is missing`);
    }
  }
  const stem = String(question.stem ?? "").trim();
  if (!stem) {
    errors.push(`${location}: empty stem`);
  } else {
    if (/(?<!_)__[^_\n]+__(?!_)/u.test(stem)) errors.push(`${location}: uncleaned AGIEval emphasis markers in stem`);
    if (/(材料[一二三四五六七八九十\d]+[：:])。/u.test(stem)) errors.push(`${location}: malformed material heading in stem`);
    if (/材料[一二三四五六七八九十\d]+[：:]\s*\n\s*(?:下列|根据)/u.test(stem)) errors.push(`${location}: truncated material body in stem`);
    if (/材料三[：:]\s*[A-D][.．]/u.test(stem)) errors.push(`${location}: option text leaked into material body in stem`);
    if (new RegExp(`(?:[（(]\\s*[）)]|项是)\\s*${label}$`, "u").test(stem)) errors.push(`${location}: answer key leaked at end of stem`);
    if (/<\/?a\b/iu.test(stem) || /学科[.*]?网|ks5u\.com/iu.test(stem)) errors.push(`${location}: HTML or scraper watermark in stem`);
    if (/\*[^*\n]+\*/u.test(stem)) errors.push(`${location}: uncleaned markdown asterisk emphasis in stem`);
    if (/<(?:庄子|古文观止|中国目录学史|五藏山经)/u.test(stem)) errors.push(`${location}: ASCII angle-bracket book title in stem`);
  }
  for (const [idx, value] of options.entries()) {
    const key = String.fromCharCode(65 + idx);
    if (/^[（(]\s*[A-DＡ-Ｄ]\s*[）)]/u.test(value)) errors.push(`${location}: option ${key} still has a label prefix`);
    if (/^[A-DＡ-Ｄ]\s*[.．、:：]/u.test(value) || /^[、.．]/u.test(value)) errors.push(`${location}: option ${key} has residual punctuation or label prefix`);
    if (/(?<!_)__[^_\n]+__(?!_)/u.test(value)) errors.push(`${location}: uncleaned AGIEval emphasis markers in option ${key}`);
  }
}

if (papers.size !== 35) errors.push(`expected 35 source papers, received ${papers.size}`);
if (merged !== 33) errors.push(`expected 33 merged duplicate groups, received ${merged}`);
if (repaired !== AGIEVAL_REPAIRED_OUTPUT_COUNT) errors.push(`expected ${AGIEVAL_REPAIRED_OUTPUT_COUNT} repaired output questions (from ${AGIEVAL_REPAIR_COUNT} repaired source rows), received ${repaired}`);

console.log(JSON.stringify({
  file: filename,
  questions: questions.length,
  uniqueIds: ids.size,
  sourcePapers: papers.size,
  mergedDuplicateGroups: merged,
  repairedSourceRows: repaired,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
