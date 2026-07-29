import { readFile, writeFile } from "node:fs/promises";

const [sourcePath, outputPrefix, rawChunkSize = "13"] = process.argv.slice(2);
const chunkSize = Number(rawChunkSize);
if (!sourcePath || !outputPrefix || !Number.isInteger(chunkSize) || chunkSize < 1) {
  throw new Error("Usage: node scripts/split-amc-source.mjs <source-file> <output-prefix> [chunk-size]");
}
const body = await readFile(sourcePath, "utf8");
const blocks = [...body.matchAll(/<<<SOURCE [^\n]+>>>\n[\s\S]*?<<<END SOURCE>>>\n?/g)].map((match) => match[0].trimEnd());
if (!blocks.length || body.replace(/<<<SOURCE [^\n]+>>>\n[\s\S]*?<<<END SOURCE>>>\n?/g, "").trim()) {
  throw new Error(`Could not parse source blocks from ${sourcePath}`);
}
let part = 0;
for (let start = 0; start < blocks.length; start += chunkSize) {
  part += 1;
  const outputPath = `${outputPrefix}-part${part}-source.txt`;
  const selected = blocks.slice(start, start + chunkSize);
  await writeFile(outputPath, `${selected.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, questions: selected.length }));
}