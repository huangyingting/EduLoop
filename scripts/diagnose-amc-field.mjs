import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [dataset, id, fieldName] = process.argv.slice(2);
if (!dataset || !id || !fieldName) {
  throw new Error("Usage: node scripts/diagnose-amc-field.mjs <amc8|amc10|amc12> <question-id> <field-name>");
}

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse((await readFile(path.join(workspace, "data/en", `${dataset}.json`), "utf8")).replace(/^\uFEFF/, ""));
const question = source.find((entry) => entry.id === id);
if (!question) throw new Error(`Unknown question ${id}`);
const sourceValue = fieldName === "title" || fieldName.startsWith("option_")
  ? question.question_info.raw_content[fieldName]
  : question.solution_info[Number(fieldName.slice("solution_".length))].solution_info;
const protectedPattern = /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[\s\S]*?(?<!\\)\$|\[Figure:\s*[^\]]+\]|\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\2\})/g;
const protectedValues = [...String(sourceValue).matchAll(protectedPattern)].map((match) => match[0]);
const directory = path.join(process.env.AMC_TRANSLATION_ROOT ?? "/tmp", `eduloop-${dataset}-translation`);
let template;
let filename;
for (const candidate of (await readdir(directory)).filter((name) => name.endsWith(".txt"))) {
  const body = await readFile(path.join(directory, candidate), "utf8");
  const block = body.match(new RegExp(`<<<QUESTION ${id}>>>\\n([\\s\\S]*?)<<<END>>>`));
  if (!block) continue;
  const field = block[1].match(new RegExp(`<<<FIELD ${fieldName}>>>\\n([\\s\\S]*?)(?=<<<FIELD [a-z0-9_]+>>>\\n|$)`));
  template = field?.[1].trim();
  filename = candidate;
  break;
}
if (template === undefined) throw new Error(`Missing ${fieldName} for ${id}`);
const counts = new Map();
for (const match of template.matchAll(/\{\{P(\d+)\}\}/g)) counts.set(Number(match[1]), (counts.get(Number(match[1])) ?? 0) + 1);
const missing = protectedValues.map((_, index) => index).filter((index) => !counts.has(index));
const repeated = [...counts].filter(([, count]) => count > 1);
const unknown = [...counts].filter(([index]) => index >= protectedValues.length);
console.log(JSON.stringify({ filename, fieldName, raw: template.startsWith("!RAW\n"), expected: protectedValues.length, missing, repeated, unknown }, null, 2));
for (const index of [...new Set([...missing, ...repeated.map(([value]) => value), ...unknown.map(([value]) => value)])].sort((a, b) => a - b)) {
  console.log(`P${index}: ${protectedValues[index] ?? "<unknown>"}`);
}