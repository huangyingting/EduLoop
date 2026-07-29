import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = process.argv[2];
const requestedSlug = process.argv[3];
const outputFile = process.argv[4];
const supportedDatasets = new Set(["amc8", "amc10", "amc12"]);
const protectedPattern = /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[\s\S]*?(?<!\\)\$|\[Figure:\s*[^\]]+\]|\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\2\})/g;

if (!supportedDatasets.has(dataset)) {
  throw new Error("Usage: node scripts/print-amc-source-paper.mjs <amc8|amc10|amc12> <paper-slug|--list> [output-file]");
}

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

function printField(output, name, value) {
  const protectedValues = [];
  const template = String(value).replace(protectedPattern, (match) => {
    const placeholder = `{{P${protectedValues.length}}}`;
    protectedValues.push(match);
    return placeholder;
  });
  output.push(`<<<FIELD ${name}>>>`, template);
  protectedValues.forEach((protectedValue, index) => output.push(`<<<PROTECTED P${index}>>> ${protectedValue}`));
}

const sourceFile = path.join(workspace, "data/en", `${dataset}.json`);
const questions = JSON.parse((await readFile(sourceFile, "utf8")).replace(/^\uFEFF/, ""));
const papers = new Map();
questions.forEach((question, index) => {
  const slug = paperSlug(question.paper);
  if (!papers.has(slug)) papers.set(slug, { name: paperName(question.paper), indexes: [] });
  papers.get(slug).indexes.push(index);
});

if (requestedSlug === "--list") {
  for (const [slug, paper] of papers) {
    console.log(`${slug}\t${paper.indexes.length}\t${paper.name}`);
  }
  process.exit(0);
}

if (!papers.has(requestedSlug) || !outputFile) {
  throw new Error(`Unknown or incomplete paper request ${requestedSlug ?? ""}`);
}

const output = [];
for (const index of papers.get(requestedSlug).indexes) {
  const question = questions[index];
  const raw = question.question_info.raw_content;
  output.push(`<<<SOURCE index=${index} id=${question.id} slug=${requestedSlug} paper=${question.paper}>>>`);
  for (const key of ["title", "option_a", "option_b", "option_c", "option_d", "option_e"]) {
    if (key in raw) printField(output, key, raw[key]);
  }
  question.solution_info.forEach(({ solution_info: solution }, solutionIndex) => {
    printField(output, `solution_${solutionIndex}`, solution);
  });
  output.push("<<<END SOURCE>>>");
}

await writeFile(outputFile, `${output.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ dataset, paper: requestedSlug, questions: papers.get(requestedSlug).indexes.length, outputFile }));