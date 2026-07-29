import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { knownMathTranslation, latexMathStructure, latexTextContents, protectedLatexSegments } from "./amc-latex.mjs";
import { collection, localeFileUrl } from "./content-manifest.mjs";

const { files: FILES, sourceLocale: SOURCE_LOCALE, translatedLocales: [TRANSLATED_LOCALE] } = collection("amc");
const mathApprovals = JSON.parse(await readFile(new URL("./amc-translation-math-approvals.json", import.meta.url), "utf8"));
const errors = [];
const controlledMathErrors = [];
const controlledMathFields = [];
const report = {};

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function figures(value) {
  return [...String(value).matchAll(/\[Figure:\s*([^\]]+)\]/g)].map((match) => match[1]);
}

function mathDelimiterCount(value) {
  return [...String(value).matchAll(/(?<!\\)\$/g)].length;
}

function mathBlocks(value) {
  return protectedLatexSegments(value)
    .filter(({ kind }) => kind !== "figure")
    .map(({ kind, value: block }) => (kind === "asy" ? block : latexMathStructure(block)));
}

function mathBlockMultiset(value) {
  return JSON.stringify(mathBlocks(value).sort());
}

for (const filename of FILES) {
  const source = JSON.parse(await readFile(localeFileUrl(SOURCE_LOCALE, filename), "utf8"));
  const translated = JSON.parse(await readFile(localeFileUrl(TRANSLATED_LOCALE, filename), "utf8"));
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
      // Chinese grammar can legitimately reorder quantities around nouns and
      // translate prose inside LaTeX text commands. Compare structural block
      // multiplicities so those language changes pass while mutations, losses,
      // and duplicated formulas still fail.
      const mathChanged = mathBlockMultiset(before) !== mathBlockMultiset(after);
      if (mathChanged) {
        const fieldKey = `${filename}/${original.id}/${field}`;
        controlledMathFields.push([fieldKey, sha256(before), sha256(after)]);
        controlledMathErrors.push(`${filename}/${original.id}: math content changed in field ${field}`);
      }
      // Chinese grammar and controlled equivalent rewrites may reorder math
      // blocks. Match reviewed LaTeX prose translations as multisets instead
      // of assuming that the nth text command remains the nth command.
      const expectedLatexText = latexTextContents(before)
        .map((sourceText) => [sourceText, knownMathTranslation(sourceText)])
        .filter(([, expected]) => expected !== undefined);
      const translatedLatexText = latexTextContents(after);
      const availableText = new Map();
      for (const value of translatedLatexText) availableText.set(value, (availableText.get(value) ?? 0) + 1);
      for (const [sourceText, expected] of expectedLatexText) {
        const remaining = availableText.get(expected) ?? 0;
        if (remaining > 0) {
          availableText.set(expected, remaining - 1);
        } else {
          const message = `${filename}/${original.id}: math term ${JSON.stringify(sourceText)} mistranslated in field ${field}`;
          (mathChanged ? controlledMathErrors : errors).push(message);
        }
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

controlledMathFields.sort(([left], [right]) => left.localeCompare(right));
const controlledMathDigest = sha256(JSON.stringify(controlledMathFields));
const approvalsMatch = mathApprovals.schemaVersion === 1
  && mathApprovals.algorithm === "sha256"
  && mathApprovals.approvedFieldCount === controlledMathFields.length
  && mathApprovals.digest === controlledMathDigest;
if (!approvalsMatch) {
  errors.push(`controlled math approval mismatch: ${JSON.stringify({
    expected: {
      schemaVersion: mathApprovals.schemaVersion,
      algorithm: mathApprovals.algorithm,
      fields: mathApprovals.approvedFieldCount,
      digest: mathApprovals.digest,
    },
    actual: {
      schemaVersion: 1,
      algorithm: "sha256",
      fields: controlledMathFields.length,
      digest: controlledMathDigest,
    },
  })}`);
  errors.push(...controlledMathErrors);
}

console.log(JSON.stringify({
  files: report,
  approvedMathRewrites: { fields: controlledMathFields.length, digest: controlledMathDigest },
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
