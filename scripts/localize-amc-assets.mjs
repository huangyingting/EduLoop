import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_FILES = ["amc8.json", "amc10.json", "amc12.json"];
const DATA_DIRECTORY = path.resolve(process.cwd(), "data");
const ASSET_DIRECTORY = path.resolve(process.cwd(), "public/question-assets/amc");
const MANIFEST_FILE = path.join(ASSET_DIRECTORY, "manifest.json");
const FIGURE_PATTERN = /\[Figure:\s*(https?:\/\/[^\]\s]+)\]/g;
const USER_AGENT = "EduLoopAMCAssetImporter/1.0 (authorized curriculum archive import)";
const ATTEMPTS_PER_URL = 3;
const MAX_BYTES = 15 * 1024 * 1024;
const HOST_INTERVALS = new Map([
  ["artofproblemsolving.com", 2_000],
  ["latex.artofproblemsolving.com", 1_000],
  ["wiki-images.artofproblemsolving.com", 1_000],
  ["live.poshenloh.com", 500],
  ["wiki.randommath.com", 100],
  ["web.archive.org", 500],
]);
const hostGates = new Map();

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rateGate(sourceUrl) {
  const hostname = new URL(sourceUrl).hostname;
  const state = hostGates.get(hostname) ?? { nextAt: 0, pauseUntil: 0, gate: Promise.resolve() };
  hostGates.set(hostname, state);
  const turn = state.gate.then(async () => {
    const wait = Math.max(0, state.nextAt - Date.now(), state.pauseUntil - Date.now());
    if (wait) await sleep(wait);
    state.nextAt = Date.now() + (HOST_INTERVALS.get(hostname) ?? 500);
  });
  state.gate = turn.catch(() => undefined);
  await turn;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

function detectedImage(buffer, contentType) {
  const declared = contentType.split(";")[0].trim().toLowerCase();
  const prefix = buffer.subarray(0, 16);
  const textPrefix = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ["png", "image/png"];
  if (prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return ["jpg", "image/jpeg"];
  if (prefix.subarray(0, 4).toString("ascii") === "GIF8") return ["gif", "image/gif"];
  if (prefix.subarray(0, 4).toString("ascii") === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WEBP") return ["webp", "image/webp"];
  if (prefix.subarray(4, 12).toString("ascii").includes("ftypavif")) return ["avif", "image/avif"];
  if (declared === "image/svg+xml" || textPrefix.startsWith("<svg") || (textPrefix.startsWith("<?xml") && textPrefix.includes("<svg"))) {
    return ["svg", "image/svg+xml"];
  }
  throw new Error(`Unsupported or invalid image response (${declared || "no content type"})`);
}

function figureUrlVariants(sourceUrl) {
  const cleaned = sourceUrl.replace(/\\n/g, "").replace(/\s/g, "");
  const url = new URL(cleaned);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  const variants = [];
  if (url.hostname === "live.poshenloh.com" && !url.pathname.startsWith("/images/past-contests/")) {
    variants.push(`${url.origin}/images/past-contests${url.pathname}${url.search}`);
  }
  const thumb = url.pathname.match(/^\/(?:wiki\/images\/)?thumb\/(.+)\/[^/]+$/);
  if (thumb) {
    const prefix = url.hostname === "artofproblemsolving.com" ? "/wiki/images/" : "/";
    variants.push(`${url.origin}${prefix}${thumb[1]}`);
  }
  variants.push(url.toString());
  return [...new Set(variants)];
}

async function fetchImage(sourceUrl) {
  let lastError;
  const requestUrls = figureUrlVariants(sourceUrl).flatMap((url) => [
    url,
    `https://web.archive.org/web/20270000000000id_/${url}`,
  ]);
  for (const requestUrl of requestUrls) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_URL; attempt += 1) {
      await rateGate(requestUrl);
      try {
      const response = await fetch(requestUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.5",
          Referer: `${new URL(requestUrl).origin}/`,
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after") ?? 0);
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(45_000, retryAfter * 1_000)
            : Math.min(45_000, 2_000 * 2 ** (attempt - 1));
          const state = hostGates.get(new URL(requestUrl).hostname);
          if (state) state.pauseUntil = Math.max(state.pauseUntil, Date.now() + delay);
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_BYTES) throw new Error(`Image exceeds ${MAX_BYTES} bytes`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_BYTES) throw new Error(`Invalid image size ${buffer.length}`);
      const [extension, contentType] = detectedImage(buffer, response.headers.get("content-type") ?? "");
      return { buffer, extension, contentType };
      } catch (error) {
        lastError = error;
        if (attempt < ATTEMPTS_PER_URL) await sleep(Math.min(8_000, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${sourceUrl}: ${message}`);
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_FILE, "utf8"));
  } catch {
    return { version: 1, assets: {} };
  }
}

async function atomicJson(filename, value) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

async function usableManifestEntry(entry) {
  if (!entry?.path?.startsWith("/question-assets/amc/")) return false;
  try {
    const file = path.join(process.cwd(), "public", entry.path.slice(1));
    const details = await stat(file);
    return details.isFile() && details.size === entry.bytes;
  } catch {
    return false;
  }
}

await mkdir(ASSET_DIRECTORY, { recursive: true });
const sources = new Map();
for (const filename of DATA_FILES) {
  const body = await readFile(path.join(DATA_DIRECTORY, filename), "utf8");
  for (const match of body.matchAll(FIGURE_PATTERN)) sources.set(match[1], true);
}

const sourceUrls = [...sources.keys()].sort();
const manifest = await readManifest();
let manifestWrite = Promise.resolve();
function saveManifest() {
  const ordered = Object.fromEntries(Object.entries(manifest.assets).sort(([left], [right]) => left.localeCompare(right)));
  const snapshot = { version: 1, assets: ordered };
  manifestWrite = manifestWrite.then(() => atomicJson(MANIFEST_FILE, snapshot));
  return manifestWrite;
}
const reusable = new Map();
for (const sourceUrl of sourceUrls) {
  const entry = manifest.assets[sourceUrl];
  if (await usableManifestEntry(entry)) reusable.set(sourceUrl, entry);
}

let completed = reusable.size;
let downloaded = 0;
console.log(`AMC figures: ${sourceUrls.length} unique (${reusable.size} already local).`);
const pending = sourceUrls.filter((sourceUrl) => !reusable.has(sourceUrl));
const outcomes = await mapConcurrent(pending, 8, async (sourceUrl) => {
  try {
    const { buffer, extension, contentType } = await fetchImage(sourceUrl);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const basename = `${sha256}.${extension}`;
    const destination = path.join(ASSET_DIRECTORY, basename);
    try {
      await access(destination);
    } catch {
      await writeFile(destination, buffer);
    }
    manifest.assets[sourceUrl] = {
      path: `/question-assets/amc/${basename}`,
      sha256,
      bytes: buffer.length,
      contentType,
    };
    completed += 1;
    downloaded += 1;
    if (completed % 10 === 0 || completed === sourceUrls.length) await saveManifest();
    if (completed % 25 === 0 || completed === sourceUrls.length) console.log(`Localized ${completed} / ${sourceUrls.length}`);
    return null;
  } catch (error) {
    return { sourceUrl, error: error instanceof Error ? error.message : String(error) };
  }
});

await saveManifest();
const failures = outcomes.filter(Boolean);
if (failures.length) {
  throw new Error(`${failures.length} figures failed:\n${failures.map(({ sourceUrl, error }) => `- ${sourceUrl}: ${error}`).join("\n")}`);
}

const orderedAssets = Object.fromEntries(Object.entries(manifest.assets).sort(([left], [right]) => left.localeCompare(right)));
await atomicJson(MANIFEST_FILE, { version: 1, assets: orderedAssets });

let replacements = 0;
for (const filename of DATA_FILES) {
  const sourceFile = path.join(DATA_DIRECTORY, filename);
  const body = await readFile(sourceFile, "utf8");
  const localized = body.replace(FIGURE_PATTERN, (marker, sourceUrl) => {
    const entry = orderedAssets[sourceUrl];
    if (!entry) throw new Error(`Missing localized asset for ${sourceUrl}`);
    replacements += 1;
    return `[Figure: ${entry.path}]`;
  });
  const temporary = `${sourceFile}.tmp`;
  await writeFile(temporary, localized, "utf8");
  await rename(temporary, sourceFile);
}

console.log(JSON.stringify({ uniqueSources: sourceUrls.length, downloaded, referencesRewritten: replacements, manifest: path.relative(process.cwd(), MANIFEST_FILE) }, null, 2));
