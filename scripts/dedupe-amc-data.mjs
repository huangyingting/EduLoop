import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const FILES = ["amc8.json", "amc10.json", "amc12.json"];

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function questionFingerprint(question) {
  const raw = question.question_info.raw_content;
  return digest(normalize([raw.title, raw.option_a, raw.option_b, raw.option_c, raw.option_d, raw.option_e].join("\n")));
}

const datasets = new Map();
for (const filename of FILES) {
  const file = path.resolve("data", "en", filename);
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

    canonical.paper = [...new Set([...canonical.paper.split(" | "), ...question.paper.split(" | ")])].join(" | ");
    const solutionFingerprints = new Set(canonical.solution_info.map(({ solution_info: solution }) => digest(normalize(solution))));
    for (const solution of question.solution_info) {
      const solutionFingerprint = digest(normalize(solution.solution_info));
      if (solutionFingerprints.has(solutionFingerprint)) continue;
      canonical.solution_info.push(solution);
      solutionFingerprints.add(solutionFingerprint);
    }
    merged += 1;
  }
}

for (const filename of FILES) {
  const file = path.resolve("data", "en", filename);
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(deduplicated.get(filename), null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

console.log(JSON.stringify({
  merged,
  records: Object.fromEntries(FILES.map((filename) => [filename, deduplicated.get(filename).length])),
  uniqueQuestions: canonicalByFingerprint.size,
}, null, 2));
