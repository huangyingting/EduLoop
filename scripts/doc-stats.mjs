import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Catalog numbers in the docs are written between markers such as
// <!-- stat:seed.published -->16,022<!-- /stat --> and checked against
// docs/catalog-stats.json. `--write` rewrites the marked numbers.

export const STATS_FILE = "docs/catalog-stats.json";
const MARKER = /<!-- stat:([\w.]+) -->(.*?)<!-- \/stat -->/g;
// Unmarked catalog-wide totals: five-digit question counts and generated
// diagram counts. Smaller, source-specific numbers stay free-form.
const UNMARKED_TOTAL = /\b\d{2},\d{3}\b(?:\s+[\w-]+){0,3}\s+questions?\b/gi;
const UNMARKED_DIAGRAMS = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:\w+\s+){0,3}(?:generated|replacement)\s+(?:\w+\s+){0,2}diagrams\b/gi;

export function formatStat(value) {
  return Number(value).toLocaleString("en-US");
}

export function statValues(stats) {
  const values = {};
  for (const section of ["seed", "repository"]) {
    for (const [key, value] of Object.entries(stats[section] ?? {})) values[`${section}.${key}`] = value;
  }
  values["derived.selfAssessed"] = stats.seed.published - stats.seed.autoGradable;
  return values;
}

export function checkDocument(text, values) {
  const problems = [];
  for (const [, key, shown] of text.matchAll(MARKER)) {
    if (!(key in values)) problems.push(`unknown stat "${key}"`);
    else if (shown !== formatStat(values[key])) problems.push(`stat "${key}" shows ${shown}, expected ${formatStat(values[key])}`);
  }
  const unmarked = text.replace(MARKER, "");
  for (const pattern of [UNMARKED_TOTAL, UNMARKED_DIAGRAMS]) {
    for (const [match] of unmarked.matchAll(pattern)) problems.push(`unmarked catalog number "${match}"; wrap the number in a stat marker`);
  }
  return problems;
}

export function rewriteDocument(text, values) {
  return text.replace(MARKER, (marker, key) => (key in values ? `<!-- stat:${key} -->${formatStat(values[key])}<!-- /stat -->` : marker));
}

async function repositoryStats(root) {
  const catalogFiles = (await readdir(path.join(root, "data/zh-CN"))).filter((name) => name.endsWith(".json")).length;
  const generatedRoot = path.join(root, "public/question-assets/generated/zh-CN");
  const questionDirectories = await readdir(generatedRoot, { withFileTypes: true });
  let generatedDiagrams = 0;
  let generatedDiagramQuestions = 0;
  for (const entry of questionDirectories.filter((item) => item.isDirectory())) {
    const svgs = (await readdir(path.join(generatedRoot, entry.name))).filter((name) => name.endsWith(".svg")).length;
    generatedDiagrams += svgs;
    if (svgs) generatedDiagramQuestions += 1;
  }
  return { catalogFiles, generatedDiagrams, generatedDiagramQuestions };
}

async function documentationFiles(root) {
  const docs = (await readdir(path.join(root, "docs"), { recursive: true }))
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join("docs", name));
  return ["README.md", "CONTRIBUTING.md", "data/README.md", ...docs].sort();
}

async function main() {
  const root = process.cwd();
  const write = process.argv.includes("--write");
  const statsPath = path.join(root, STATS_FILE);
  const stats = JSON.parse(await readFile(statsPath, "utf8"));
  const problems = [];

  const repository = await repositoryStats(root);
  if (JSON.stringify(repository) !== JSON.stringify(stats.repository)) {
    if (write) {
      stats.repository = repository;
      await writeFile(statsPath, `${JSON.stringify(stats, null, 2)}\n`);
    } else {
      problems.push(`${STATS_FILE}: repository stats ${JSON.stringify(stats.repository)} do not match the repository ${JSON.stringify(repository)}`);
    }
  }

  const values = statValues(stats);
  for (const file of await documentationFiles(root)) {
    let text;
    try {
      text = await readFile(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    if (write) {
      const updated = rewriteDocument(text, values);
      if (updated !== text) await writeFile(path.join(root, file), updated);
      text = updated;
    }
    for (const problem of checkDocument(text, values)) problems.push(`${file}: ${problem}`);
  }

  if (problems.length) {
    console.error(problems.join("\n"));
    console.error("Run `npm run docs:check -- --write` after updating docs/catalog-stats.json.");
    process.exitCode = 1;
  } else {
    console.log("Documentation catalog numbers match docs/catalog-stats.json.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
