import { readFile, writeFile } from "node:fs/promises";

const [sourcePath, translationPath] = process.argv.slice(2);
if (!sourcePath || !translationPath) {
  throw new Error("Usage: node scripts/normalize-amc-fragment.mjs <source-template> <translation-fragment>");
}

function parseSourceFields(block) {
  const fields = new Map();
  const fieldPattern = /<<<FIELD ([a-z0-9_]+)>>>\n([\s\S]*?)(?=<<<FIELD [a-z0-9_]+>>>\n|<<<END SOURCE>>>)/g;
  for (const match of block.matchAll(fieldPattern)) {
    const values = new Map();
    for (const protectedMatch of match[2].matchAll(/<<<PROTECTED P(\d+)>>> ([\s\S]*?)(?=\n<<<PROTECTED P\d+>>>|\n<<<FIELD |\n<<<END SOURCE>>>)/g)) {
      values.set(Number(protectedMatch[1]), protectedMatch[2].trim());
    }
    fields.set(match[1], values);
  }
  return fields;
}

const sourceBody = await readFile(sourcePath, "utf8");
const sourceById = new Map();
for (const match of sourceBody.matchAll(/<<<SOURCE [^\n]*\bid=([a-f0-9]{32})[^\n]*>>>\n([\s\S]*?)<<<END SOURCE>>>/g)) {
  sourceById.set(match[1], parseSourceFields(`${match[2]}<<<END SOURCE>>>`));
}

let body = await readFile(translationPath, "utf8");
let replacements = 0;
body = body.replace(/<<<QUESTION ([a-f0-9]{32})>>>\n([\s\S]*?)<<<END>>>/g, (whole, id, block) => {
  const sourceFields = sourceById.get(id);
  if (!sourceFields) throw new Error(`Unknown source question ${id}`);
  const updatedBlock = block.replace(/<<<FIELD ([a-z0-9_]+)>>>\n([\s\S]*?)(?=<<<FIELD [a-z0-9_]+>>>\n|$)/g, (fieldWhole, fieldName, rawTemplate) => {
    let template = rawTemplate.trim();
    if (template.startsWith("!RAW\n")) return fieldWhole;
    const values = sourceFields.get(fieldName);
    if (!values) return fieldWhole;
    const existing = new Set([...template.matchAll(/\{\{P(\d+)\}\}/g)].map((match) => Number(match[1])));
    const groups = new Map();
    for (const [index, value] of values) {
      if (existing.has(index)) continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(index);
    }
    for (const [value, indexes] of [...groups].sort((left, right) => right[0].length - left[0].length)) {
      const occurrences = template.split(value).length - 1;
      if (occurrences !== indexes.length) continue;
      for (const index of indexes) {
        template = template.replace(value, `{{P${index}}}`);
        replacements += 1;
      }
    }
    const trailingNewline = rawTemplate.endsWith("\n") ? "\n" : "";
    return `<<<FIELD ${fieldName}>>>\n${template}${trailingNewline}`;
  });
  return `<<<QUESTION ${id}>>>\n${updatedBlock}<<<END>>>`;
});

await writeFile(translationPath, body, "utf8");
console.log(JSON.stringify({ translationPath, replacements }));