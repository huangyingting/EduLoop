import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { collection, localeDirectory } from "./content-manifest.mjs";

const { files: FILES, sourceLocale: SOURCE_LOCALE } = collection("amc");
const SOURCE_DIRECTORY = localeDirectory(SOURCE_LOCALE);

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function questionFingerprint(question) {
  const options = question.options;
  return digest(normalize([question.stem, options.A, options.B, options.C, options.D, options.E].join("\n")));
}

const datasets = new Map();
for (const filename of FILES) {
  const file = path.join(SOURCE_DIRECTORY, filename);
  datasets.set(filename, JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")));
}

const canonicalByFingerprint = new Map();
const deduplicated = new Map(FILES.map((filename) => [filename, []]));
let merged = 0;

for (const filename of FILES) {
  for (const question of datasets.get(filename)) {
    const fingerprint = questionFingerprint(question);
    const canonical = canonicalByFingerprint.get(fingerprint);
    if (!canonical) {
      canonicalByFingerprint.set(fingerprint, question);
      deduplicated.get(filename).push(question);
      continue;
    }

    canonical.sourcePaper = [...new Set([...canonical.sourcePaper.split(" | "), ...question.sourcePaper.split(" | ")])].join(" | ");
    const solutionFingerprints = new Set(canonical.solutions.map((solution) => digest(normalize(solution))));
    for (const solution of question.solutions) {
      const solutionFingerprint = digest(normalize(solution));
      if (solutionFingerprints.has(solutionFingerprint)) continue;
      canonical.solutions.push(solution);
      solutionFingerprints.add(solutionFingerprint);
    }
    merged += 1;
  }
}

for (const filename of FILES) {
  const file = path.join(SOURCE_DIRECTORY, filename);
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(deduplicated.get(filename), null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

console.log(JSON.stringify({
  merged,
  records: Object.fromEntries(FILES.map((filename) => [filename, deduplicated.get(filename).length])),
  uniqueQuestions: canonicalByFingerprint.size,
}, null, 2));
