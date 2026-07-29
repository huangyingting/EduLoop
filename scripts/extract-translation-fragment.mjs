import { readFile, writeFile } from "node:fs/promises";

const [reportPath, outputPath, selection] = process.argv.slice(2);
if (!reportPath || !outputPath) {
  throw new Error("Usage: node scripts/extract-translation-fragment.mjs <report-path> <output-path> [--last]");
}

const report = await readFile(reportPath, "utf8");
const codeBlocks = [...report.matchAll(/```[^\n]*\n([\s\S]*?)\n```/g)]
  .map((match) => match[1])
  .filter((body) => body.includes("<<<QUESTION ") || body.includes("<<<SOURCE "));
const idSequences = codeBlocks.map((body) => [...body.matchAll(/<<<(?:QUESTION|SOURCE) [^\n]*?(?:\bid=)?([a-f0-9]{32})[^\n]*>>>/g)].map((match) => match[1]));
const duplicateFullDrafts = idSequences.length > 1
  && idSequences[0].length > 0
  && idSequences.every((ids) => JSON.stringify(ids) === JSON.stringify(idSequences[0]));
if (codeBlocks.length !== 1 && !duplicateFullDrafts && selection !== "--last") {
  throw new Error(`Expected exactly one translation code block, found ${codeBlocks.length}`);
}
const fragment = codeBlocks.at(-1)
  .replace(/<<<PROTECTED P\d+>>>[\s\S]*?(?=<<<PROTECTED P\d+>>>|<<<FIELD |<<<END)/g, "")
  .replace(/^<<<QUESTION id=([a-f0-9]{32})>>>$/gm, "<<<QUESTION $1>>>")
  .replace(/^<<<QUESTION [^\n]*\bid=([a-f0-9]{32})[^\n]*>>>$/gm, "<<<QUESTION $1>>>")
  .replace(/^<<<SOURCE [^\n]*\bid=([a-f0-9]{32})[^\n]*>>>$/gm, "<<<QUESTION $1>>>")
  .replace(/^<<<END(?: QUESTION| SOURCE)?>>>$/gm, "<<<END>>>")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
await writeFile(outputPath, `${fragment}\n`, "utf8");
console.log(JSON.stringify({ outputPath, questions: (fragment.match(/^<<<QUESTION /gm) ?? []).length }));