import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collection, localeDirectory } from "./content-manifest.mjs";

const LEVEL_BY_FILE = new Map([
  ["amc8.json", "AMC-8"],
  ["amc10.json", "AMC-10"],
  ["amc12.json", "AMC-12"],
]);

export function amcLevelForFilename(filename) {
  const level = LEVEL_BY_FILE.get(filename);
  if (!level) throw new Error(`Unsupported AMC filename: ${filename}`);
  return level;
}

export function normalizeAmcGrades(records, level, filename = "<input>") {
  if (!Array.isArray(records)) throw new Error(`${filename} must contain a JSON array`);
  let changed = 0;
  const questions = records.map((question, index) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      throw new Error(`${filename} record ${index + 1} must be an object`);
    }
    if (question.grade_band === level && question.grade === level) return question;
    changed += 1;
    return { ...question, grade_band: level, grade: level };
  });
  return { questions, changed };
}

export async function updateAmcGradeLevels({ check = false } = {}) {
  const { files, sourceLocale, translatedLocales } = collection("amc");
  const locales = [sourceLocale, ...translatedLocales];
  const results = [];

  for (const locale of locales) {
    for (const filename of files) {
      const file = path.join(localeDirectory(locale), filename);
      const body = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
      const records = JSON.parse(body);
      const level = amcLevelForFilename(filename);
      const { questions, changed } = normalizeAmcGrades(records, level, `${locale}/${filename}`);
      if (changed > 0 && !check) {
        const temporary = `${file}.tmp`;
        await writeFile(temporary, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
        await rename(temporary, file);
      }
      results.push({ locale, filename, level, records: questions.length, changed });
    }
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const unsupported = args.filter((arg) => arg !== "--check");
  if (unsupported.length) throw new Error(`Unsupported option: ${unsupported.join(", ")}`);
  const check = args.includes("--check");
  const results = await updateAmcGradeLevels({ check });
  const changedRecords = results.reduce((total, result) => total + result.changed, 0);
  console.log(JSON.stringify({ mode: check ? "check" : "write", changedRecords, files: results }, null, 2));
  if (check && changedRecords > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}