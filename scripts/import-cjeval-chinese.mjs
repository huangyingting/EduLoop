import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CJEVAL_COMMIT, CJEVAL_SPLITS, convertCjevalRecord } from "./cjeval.mjs";

const outputPath = path.join(process.cwd(), "data", "zh-CN", "chinese.json");

async function downloadSplit(split) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const encodedFilename = `${split.name}_%E5%88%9D%E4%B8%AD%E8%AF%AD%E6%96%87.json`;
  const url = `https://raw.githubusercontent.com/SmileWHC/CJEval/${CJEVAL_COMMIT}/data/CJEval_data/${split.name}/${encodedFilename}`;
  try {
    const response = await fetch(url, { redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error(`CJEval ${split.name} download failed with HTTP ${response.status}`);
    const body = await response.text();
    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== split.sha256) throw new Error(`CJEval ${split.name} SHA-256 mismatch: expected ${split.sha256}, received ${digest}`);
    const records = body.replace(/^\uFEFF/u, "").split(/\r?\n/gu).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`CJEval ${split.name} line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    if (records.length !== split.count) throw new Error(`CJEval ${split.name} expected ${split.count} records, received ${records.length}`);
    return records.map((record, index) => convertCjevalRecord(record, split.name, index));
  } finally {
    clearTimeout(timeout);
  }
}

const questions = (await Promise.all(CJEVAL_SPLITS.map(downloadSplit))).flat();
if (new Set(questions.map((question) => question.id)).size !== questions.length) throw new Error("CJEval conversion produced duplicate IDs");
await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
const reviewCount = questions.filter((question) => question.quality.includes("NEEDS_REVIEW")).length;
console.log(`Wrote ${questions.length} CJEval Chinese questions to ${outputPath} (${reviewCount} conversion issues marked for review).`);
