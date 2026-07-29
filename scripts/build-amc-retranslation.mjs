import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateKnownMathText } from "./amc-latex.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = process.argv[2];
const supportedDatasets = new Set(["amc8", "amc10", "amc12"]);
if (!supportedDatasets.has(dataset)) {
  throw new Error("Usage: node scripts/build-amc-retranslation.mjs <amc8|amc10|amc12> [--check] [--partial] [--final]");
}

const sourceFile = path.join(workspace, "data/en", `${dataset}.json`);
const translationDirectory = path.join(process.env.AMC_TRANSLATION_ROOT ?? "/tmp", `eduloop-${dataset}-translation`);
const outputDirectory = process.argv.includes("--final")
  ? path.join(workspace, "data/zh-CN")
  : path.join(workspace, "data/zh-CN-retranslated");
const outputFile = path.join(outputDirectory, `${dataset}.json`);
const checkOnly = process.argv.includes("--check");
const allowPartial = process.argv.includes("--partial");
const protectedPattern = /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[\s\S]*?(?<!\\)\$|\[Figure:\s*[^\]]+\]|\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\2\})/g;

function paperName(value) {
  return String(value).split(" | ", 1)[0].replace(/ · Problem \d+$/, "");
}

function paperSlug(value) {
  const name = paperName(value);
  if (dataset === "amc8") {
    const match = name.match(/^(\d{4}) (?:AJHSME|AMC 8)$/);
    if (!match) throw new Error(`Cannot derive AMC 8 paper slug from ${value}`);
    return match[1];
  }
  const level = dataset === "amc10" ? "10" : "12";
  const match = name.match(new RegExp(`^(\\d{4})( Fall)? AMC ${level}([ABP])$`));
  if (!match) throw new Error(`Cannot derive ${dataset} paper slug from ${value}`);
  return `${match[1]}${match[2] ? "-Fall" : ""}${match[3]}`;
}

function parseTranslations(body, filename) {
  const translations = [];
  const blockPattern = /<<<QUESTION ([a-f0-9]{32})>>>\n([\s\S]*?)<<<END>>>/g;
  for (const block of body.matchAll(blockPattern)) {
    const fields = {};
    const fieldPattern = /<<<FIELD ([a-z0-9_]+)>>>\n([\s\S]*?)(?=<<<FIELD [a-z0-9_]+>>>\n|$)/g;
    for (const field of block[2].matchAll(fieldPattern)) {
      fields[field[1]] = field[2].trim();
    }
    translations.push({ id: block[1], fields, filename });
  }
  const residue = body.replace(blockPattern, "").trim();
  if (residue) throw new Error(`${filename} contains text outside translation blocks`);
  return translations;
}

function figureReferences(value) {
  return [...String(value).matchAll(/\[Figure:\s*([^\]\s]+)\]/g)].map((match) => match[1]).sort();
}

function boxedChoices(value) {
  const choices = [];
  const text = String(value);
  let cursor = 0;
  while ((cursor = text.indexOf("\\boxed{", cursor)) !== -1) {
    const start = cursor + "\\boxed{".length;
    let depth = 1;
    let end = start;
    for (; end < text.length && depth > 0; end += 1) {
      if (text[end] === "{" && text[end - 1] !== "\\") depth += 1;
      else if (text[end] === "}" && text[end - 1] !== "\\") depth -= 1;
    }
    const content = text.slice(start, end - 1).trim();
    const match = content.match(/^([A-E])$/)
      ?? content.match(/^\\textbf\{([A-E])\}$/)
      ?? content.match(/(?:^|\\(?:textbf|text)\{)\s*\(([A-E])\)/)
      ?? content.match(/^\(\s*\\mathrm\{([A-E])\}\s*\)/);
    if (match) choices.push(match[1]);
    cursor = end;
  }
  return choices;
}

function resolveProtectedContent(source, template, location, expectedChoice = null) {
  if (!template.trim()) throw new Error(`${location} is empty`);
  if (template.includes("�")) throw new Error(`${location} contains a replacement character`);
  const protectedValues = [...source.matchAll(protectedPattern)].map((match) => match[0]);
  let translated;
  const unprotectedSource = source.replace(protectedPattern, "").trim();
  if (!unprotectedSource && template === source.trim()) {
    translated = source.trim();
  } else if (template.startsWith("!RAW\n")) {
    translated = template.slice(5).trim().replace(/\{\{P(\d+)\}\}/g, (_, rawIndex) => {
      const protectedValue = protectedValues[Number(rawIndex)];
      if (protectedValue === undefined) throw new Error(`${location} references unknown protected placeholder P${rawIndex}`);
      return protectedValue;
    });
  } else {
    const placeholders = [...template.matchAll(/\{\{P(\d+)\}\}/g)].map((match) => Number(match[1]));
    const expected = protectedValues.map((_, index) => index);
    if (JSON.stringify([...placeholders].sort((left, right) => left - right)) !== JSON.stringify(expected)) {
      throw new Error(`${location} must contain each protected placeholder exactly once`);
    }
    translated = template.replace(/\{\{P(\d+)\}\}/g, (_, rawIndex) => protectedValues[Number(rawIndex)]);
  }
  if (/\{\{P\d+\}\}/.test(translated)) throw new Error(`${location} contains an unresolved protected placeholder`);
  translated = translateKnownMathText(translated);
  const sourceFigures = figureReferences(source);
  const translatedFigures = figureReferences(translated);
  if (JSON.stringify(sourceFigures) !== JSON.stringify(translatedFigures)) {
    throw new Error(`${location} changed figure references: ${JSON.stringify({ sourceFigures, translatedFigures })}`);
  }
  const sourceChoices = boxedChoices(source);
  const translatedChoices = boxedChoices(translated);
  if (sourceChoices.length > 0) {
    if (translatedChoices.length === 0 || (expectedChoice && translatedChoices.some((choice) => choice !== expectedChoice))) {
      throw new Error(`${location} has incorrect boxed answer choices: ${JSON.stringify({ expectedChoice, sourceChoices, translatedChoices })}`);
    }
  }
  if ([...translated.matchAll(/(?<!\\)\$/g)].length % 2 !== 0) {
    throw new Error(`${location} has unbalanced dollar delimiters`);
  }
  return translated;
}

const source = JSON.parse((await readFile(sourceFile, "utf8")).replace(/^\uFEFF/, ""));
const sourceById = new Map(source.map((question) => [question.id, question]));
let filenames = [];
try {
  filenames = (await readdir(translationDirectory)).filter((filename) => filename.endsWith(".txt")).sort();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const translations = new Map();
for (const filename of filenames) {
  const body = await readFile(path.join(translationDirectory, filename), "utf8");
  const stem = filename.slice(0, -4);
  for (const translation of parseTranslations(body, filename)) {
    const question = sourceById.get(translation.id);
    if (!question) throw new Error(`${filename} contains unknown question ${translation.id}`);
    const expectedSlug = paperSlug(question.paper);
    if (stem !== expectedSlug && !stem.startsWith(`${expectedSlug}-`)) {
      throw new Error(`${filename} contains ${translation.id} from ${paperName(question.paper)} (${expectedSlug})`);
    }
    if (translations.has(translation.id)) throw new Error(`Duplicate translation for ${translation.id}`);
    translations.set(translation.id, translation);
  }
}

const output = source.map((question) => {
  const translation = translations.get(question.id);
  if (!translation) return structuredClone(question);
  const translated = structuredClone(question);
  const sourceRaw = question.question_info.raw_content;
  const targetRaw = translated.question_info.raw_content;
  const requiredFields = ["title", ...question.solution_info.map((_, index) => `solution_${index}`)];
  for (const field of requiredFields) {
    if (!(field in translation.fields)) throw new Error(`${translation.filename}/${question.id} is missing ${field}`);
  }
  const allowedFields = new Set([
    "title", "option_a", "option_b", "option_c", "option_d", "option_e",
    ...question.solution_info.map((_, index) => `solution_${index}`),
  ]);
  for (const field of Object.keys(translation.fields)) {
    if (!allowedFields.has(field)) throw new Error(`${translation.filename}/${question.id} has unknown field ${field}`);
  }
  for (const field of ["title", "option_a", "option_b", "option_c", "option_d", "option_e"]) {
    if (!(field in translation.fields)) continue;
    targetRaw[field] = resolveProtectedContent(sourceRaw[field], translation.fields[field], `${question.id}/${field}`);
  }
  for (const field of Object.keys(targetRaw)) {
    targetRaw[field] = translateKnownMathText(targetRaw[field]);
  }
  translated.solution_info = question.solution_info.map((entry, index) => ({
    ...structuredClone(entry),
    solution_info: resolveProtectedContent(
      entry.solution_info,
      translation.fields[`solution_${index}`],
      `${question.id}/solution_${index}`,
      question.answer_info.raw_content.match(/[A-E]/)?.[0] ?? null,
    ),
  }));
  translated.paper = translated.paper.replace(/ · Problem (\d+)/g, " · 第 $1 题");
  return translated;
});

if (!allowPartial && translations.size !== source.length) {
  throw new Error(`Translation is incomplete: ${translations.size} / ${source.length} questions`);
}

console.log(JSON.stringify({
  dataset,
  files: filenames.length,
  translatedQuestions: translations.size,
  totalQuestions: source.length,
}, null, 2));
if (!checkOnly) {
  await mkdir(outputDirectory, { recursive: true });
  const temporary = `${outputFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, outputFile);
  console.log(`Wrote ${outputFile}`);
}
