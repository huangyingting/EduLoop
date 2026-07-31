import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AGIEVAL_COMMIT,
  AGIEVAL_OUTPUT_COUNT,
  AGIEVAL_SOURCE_PATH,
  AGIEVAL_SOURCE_SHA256,
  convertAgievalRecords,
  parseAgievalJsonl,
} from "./agieval.mjs";

const outputPath = path.join(process.cwd(), "data", "zh-CN", "chinese-high-school.json");
const sourceUrl = `https://raw.githubusercontent.com/ruixiangcui/AGIEval/${AGIEVAL_COMMIT}/${AGIEVAL_SOURCE_PATH}`;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);

try {
  const response = await fetch(sourceUrl, { redirect: "error", signal: controller.signal });
  if (!response.ok) throw new Error(`AGIEval download failed with HTTP ${response.status}`);
  const advertisedBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedBytes) && advertisedBytes > 5_000_000) {
    throw new Error(`AGIEval source is unexpectedly large: ${advertisedBytes} bytes`);
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 5_000_000) throw new Error("AGIEval source exceeds the 5 MB limit");
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== AGIEVAL_SOURCE_SHA256) {
    throw new Error(`AGIEval SHA-256 mismatch: expected ${AGIEVAL_SOURCE_SHA256}, received ${digest}`);
  }
  const questions = convertAgievalRecords(parseAgievalJsonl(body));
  await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  console.log(`Wrote ${questions.length} unique AGIEval high-school Chinese questions to ${outputPath} (${AGIEVAL_OUTPUT_COUNT} expected).`);
} finally {
  clearTimeout(timeout);
}
