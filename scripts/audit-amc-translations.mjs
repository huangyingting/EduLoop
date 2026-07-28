import { readFile } from "node:fs/promises";

const FILES = ["amc8.json", "amc10.json", "amc12.json"];
const errors = [];
const report = {};

function figures(value) {
  return [...String(value).matchAll(/\[Figure:\s*([^\]]+)\]/g)].map((match) => match[1]);
}

function mathDelimiterCount(value) {
  return [...String(value).matchAll(/(?<!\\)\$/g)].length;
}

function mathBlocks(value) {
  return [...String(value).matchAll(/\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$])*?(?<!\\)\$/g)].map((match) => match[0]);
}

function mathBlockMultiset(value) {
  return JSON.stringify(mathBlocks(value).sort());
}

for (const filename of FILES) {
  const source = JSON.parse(await readFile(new URL(`../data/${filename}`, import.meta.url), "utf8"));
  const translated = JSON.parse(await readFile(new URL(`../data/zh-CN/${filename}`, import.meta.url), "utf8"));
  if (source.length !== translated.length) errors.push(`${filename}: question count changed`);
  let chineseQuestions = 0;
  let translatedFields = 0;
  for (let index = 0; index < source.length; index += 1) {
    const original = source[index];
    const chinese = translated[index];
    if (!chinese || original.id !== chinese.id) {
      errors.push(`${filename}: ID/order mismatch at index ${index}`);
      continue;
    }
    for (const key of ["id", "type", "grade_band", "difficulty", "grade", "course", "online_test", "option_split", "quality"]) {
      if (JSON.stringify(original[key]) !== JSON.stringify(chinese[key])) errors.push(`${filename}/${original.id}: metadata ${key} changed`);
    }
    if (original.question_info.raw_content.answer1 !== chinese.question_info.raw_content.answer1
      || original.answer_info.raw_content !== chinese.answer_info.raw_content) {
      errors.push(`${filename}/${original.id}: answer key changed`);
    }
    const sourceFields = [
      ...Object.values(original.question_info.raw_content),
      ...original.solution_info.map(({ solution_info }) => solution_info),
    ];
    const translatedValues = [
      ...Object.values(chinese.question_info.raw_content),
      ...chinese.solution_info.map(({ solution_info }) => solution_info),
    ];
    if (sourceFields.length !== translatedValues.length) {
      errors.push(`${filename}/${original.id}: translatable field count changed`);
      continue;
    }
    if (translatedValues.some((value) => /[\u3400-\u9fff]/.test(String(value)))) chineseQuestions += 1;
    for (let field = 0; field < sourceFields.length; field += 1) {
      const before = String(sourceFields[field]);
      const after = String(translatedValues[field]);
      if (before !== after) translatedFields += 1;
      if (mathDelimiterCount(after) % 2 !== 0) {
        errors.push(`${filename}/${original.id}: unbalanced math delimiters in field ${field}`);
      }
      // Chinese grammar can legitimately reorder quantities around nouns. Compare
      // exact block multiplicities so reordering passes while mutations, losses,
      // and duplicated formulas still fail.
      if (mathBlockMultiset(before) !== mathBlockMultiset(after)) {
        errors.push(`${filename}/${original.id}: math content changed in field ${field}`);
      }
      if (JSON.stringify(figures(before)) !== JSON.stringify(figures(after))) {
        errors.push(`${filename}/${original.id}: figure references changed in field ${field}`);
      }
      if (/problems and solutions on this page are the property of the MAA/i.test(after)) {
        errors.push(`${filename}/${original.id}: source attribution boilerplate remains`);
      }
      if (/⟪[PTB]\d+Q⟫|P\d+Q|A+(?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)+A+/i.test(after)) {
        errors.push(`${filename}/${original.id}: unresolved translation marker in field ${field}`);
      }
    }
  }
  report[filename] = { questions: translated.length, chineseQuestions, translatedFields };
}

console.log(JSON.stringify({ files: report, errors }, null, 2));
if (errors.length) process.exitCode = 1;
