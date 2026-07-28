import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { collection, localeDirectory } from "./content-manifest.mjs";

const { files: FILES, sourceLocale: SOURCE_LOCALE, translatedLocales: [TRANSLATED_LOCALE] } = collection("amc");
const SOURCE_DIRECTORY = localeDirectory(SOURCE_LOCALE);
const OUTPUT_DIRECTORY = localeDirectory(TRANSLATED_LOCALE);
const CACHE_FILE = path.resolve(process.cwd(), ".cache/amc-zh-CN-translations.json");
const ENDPOINT = "https://clients5.google.com/translate_a/t";
const MAX_REQUEST_CHARACTERS = 3_800;
const MAX_UNIT_CHARACTERS = 2_800;
const MIN_REQUEST_INTERVAL_MS = 500;
const PROTECTED_CONTENT = /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$])*?(?<!\\)\$|\[Figure:\s*[^\]]+\])/g;
const EXACT_PROTECTION_MARKER = /⟪P(\d+)Q⟫/g;
const MANGLED_TRANSLATION_MARKER = /(?<!⟪)P\d+Q|A+(?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)+A+/i;
const USER_CONTENT_KEYS = ["title", "option_a", "option_b", "option_c", "option_d", "option_e"];

let nextProtectionId = 0;
let nextRequestAt = 0;
const protections = new Map();
const units = [];
const unitIds = new Map();

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hasEnglish(value) {
  return /[A-Za-z]{2,}/.test(value.replace(/⟪P\d+Q⟫/g, ""));
}

function protectionIds(value) {
  return [...value.matchAll(EXACT_PROTECTION_MARKER)].map((match) => Number(match[1])).sort((left, right) => left - right);
}

function hasMatchingProtectionMarkers(source, translated) {
  return JSON.stringify(protectionIds(source)) === JSON.stringify(protectionIds(translated))
    && !MANGLED_TRANSLATION_MARKER.test(translated);
}

function protectedContent(value) {
  return [...value.matchAll(PROTECTED_CONTENT)].map((match) => match[0]).sort();
}

function registerUnit(value) {
  const existing = unitIds.get(value);
  if (existing !== undefined) return `⟪T${existing}Q⟫`;
  const id = units.length;
  units.push(value);
  unitIds.set(value, id);
  return `⟪T${id}Q⟫`;
}

function translatableLatex(math) {
  return math;
}

function protectContent(value) {
  return value.replace(PROTECTED_CONTENT, (protectedValue) => {
    const id = nextProtectionId;
    nextProtectionId += 1;
    protections.set(id, protectedValue.startsWith("$") ? translatableLatex(protectedValue) : protectedValue);
    return `⟪P${id}Q⟫`;
  });
}

function splitLongPiece(value) {
  if (value.length <= MAX_UNIT_CHARACTERS) return [value];
  const pieces = [];
  let rest = value;
  while (rest.length > MAX_UNIT_CHARACTERS) {
    const candidate = rest.slice(0, MAX_UNIT_CHARACTERS + 1);
    const boundary = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("? "), candidate.lastIndexOf("! "), candidate.lastIndexOf("; "), candidate.lastIndexOf(" "));
    const end = boundary > MAX_UNIT_CHARACTERS / 2 ? boundary + 1 : MAX_UNIT_CHARACTERS;
    pieces.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function prepareValue(value) {
  const protectedValue = protectContent(value);
  return protectedValue.split(/(\n{2,})/).flatMap((part) => (
    /^\n+$/.test(part) ? [part] : splitLongPiece(part)
  )).map((part) => (hasEnglish(part) ? registerUnit(part) : part)).join("");
}

function prepareQuestion(question) {
  const translated = structuredClone(question);
  const raw = translated.question_info.raw_content;
  for (const key of USER_CONTENT_KEYS) raw[key] = prepareValue(String(raw[key] ?? ""));
  translated.solution_info = translated.solution_info.map(({ solution_info: solution }) => ({
    solution_info: prepareValue(String(solution)),
  }));
  translated.paper = String(translated.paper ?? "").replace(/ · Problem (\d+)/g, " · 第 $1 题");
  return translated;
}

async function readCache() {
  try {
    return new Map(JSON.parse(await readFile(CACHE_FILE, "utf8")));
  } catch {
    return new Map();
  }
}

async function saveCache(cache) {
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  const temporary = `${CACHE_FILE}.tmp`;
  await writeFile(temporary, `${JSON.stringify([...cache])}\n`, "utf8");
  await rename(temporary, CACHE_FILE);
}

async function requestTranslation(value) {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    try {
      const body = new URLSearchParams({ q: value });
      const response = await fetch(`${ENDPOINT}?client=it&sl=en&tl=zh-CN`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const translated = typeof payload?.[0] === "string"
        ? payload.join("")
        : payload?.[0]?.map((part) => part?.[0] ?? "").join("");
      if (!translated) throw new Error("Translation response was empty");
      return translated;
    } catch (error) {
      lastError = error;
      if (attempt < 20) {
        const rateLimited = error instanceof Error && error.message === "HTTP 429";
        const delay = rateLimited
          ? Math.min(180_000, 30_000 * attempt)
          : Math.min(30_000, 500 * 2 ** (attempt - 1));
        if (rateLimited) console.log(`Translation service rate-limited; retrying in ${Math.round(delay / 1_000)}s (attempt ${attempt}/20).`);
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Translation request failed");
}

function taggedBatch(values) {
  return values.map((value, index) => `⟪B${index}Q⟫${value}`).join("\n");
}

async function translateBatch(values) {
  if (!values.length) return [];
  const translated = await requestTranslation(taggedBatch(values));
  const markers = [...translated.matchAll(/⟪B(\d+)Q⟫/g)];
  if (markers.length !== values.length || markers.some((marker, index) => Number(marker[1]) !== index)) {
    if (values.length === 1) {
      const withoutOptionalMarker = translated.replace(/^\s*⟪B0Q⟫/, "").trim();
      if (!withoutOptionalMarker) throw new Error("Single-item translation response was empty");
      return [withoutOptionalMarker];
    }
    const middle = Math.ceil(values.length / 2);
    return [...await translateBatch(values.slice(0, middle)), ...await translateBatch(values.slice(middle))];
  }
  return markers.map((marker, index) => translated.slice(
    (marker.index ?? 0) + marker[0].length,
    markers[index + 1]?.index ?? translated.length,
  ).replace(/^\s+|\s+$/g, ""));
}

async function fillTranslationCache(cache) {
  let invalidated = 0;
  for (const unit of new Set(units)) {
    const translated = cache.get(unit);
    if (translated && !hasMatchingProtectionMarkers(unit, translated)) {
      cache.delete(unit);
      invalidated += 1;
    }
  }
  if (invalidated) console.log(`Discarded ${invalidated} cached translations with damaged placeholders.`);
  const pending = [...new Set(units)].filter((unit) => !cache.has(unit));
  let completed = 0;
  for (let offset = 0; offset < pending.length;) {
    const batch = [];
    let characters = 0;
    while (offset < pending.length) {
      const candidate = pending[offset];
      const cost = candidate.length + 14;
      if (batch.length && characters + cost > MAX_REQUEST_CHARACTERS) break;
      batch.push(candidate);
      characters += cost;
      offset += 1;
    }
    const translations = await translateBatch(batch);
    translations.forEach((translation, index) => {
      if (!hasMatchingProtectionMarkers(batch[index], translation)) {
        throw new Error(`Translation service damaged protected content in segment ${digest(batch[index]).slice(0, 12)}`);
      }
      cache.set(batch[index], translation);
    });
    completed += batch.length;
    await saveCache(cache);
    if (completed % 100 < batch.length || completed === pending.length) {
      console.log(`Translated ${completed} / ${pending.length} uncached text segments`);
    }
  }
  return pending.length;
}

function resolveTemplate(value, cache) {
  const translatedTemplate = value.replace(/⟪T(\d+)Q⟫/g, (_, rawId) => {
    const source = units[Number(rawId)];
    const translated = cache.get(source);
    if (!translated) throw new Error(`Missing translation for segment ${rawId}`);
    return translated;
  });
  const expectedProtectedContent = protectionIds(translatedTemplate).map((id) => {
    const protectedValue = protections.get(id);
    if (protectedValue === undefined) throw new Error(`Missing protected content ${id}`);
    return protectedValue;
  }).sort();
  let resolved = translatedTemplate.replace(EXACT_PROTECTION_MARKER, (_, rawId) => {
    const protectedValue = protections.get(Number(rawId));
    if (protectedValue === undefined) throw new Error(`Missing protected content ${rawId}`);
    return protectedValue;
  });
  resolved = resolved.replace(/⟪T(\d+)Q⟫/g, (_, rawId) => {
    const source = units[Number(rawId)];
    const translated = cache.get(source);
    if (!translated) throw new Error(`Missing nested translation for segment ${rawId}`);
    return translated;
  });
  if (MANGLED_TRANSLATION_MARKER.test(resolved) || /⟪[PTB]\d+Q⟫/.test(resolved)) {
    throw new Error("Translation contains an unresolved placeholder");
  }
  if (JSON.stringify(expectedProtectedContent) !== JSON.stringify(protectedContent(resolved))) {
    throw new Error("Translation changed protected math or figure content");
  }
  return resolved;
}

function resolveQuestion(question, cache) {
  const resolved = structuredClone(question);
  const raw = resolved.question_info.raw_content;
  for (const key of USER_CONTENT_KEYS) raw[key] = resolveTemplate(String(raw[key] ?? ""), cache);
  resolved.solution_info = resolved.solution_info.map(({ solution_info: solution }) => ({
    solution_info: resolveTemplate(String(solution), cache),
  }));
  return resolved;
}

const preparedFiles = [];
for (const filename of FILES) {
  const source = await readFile(path.join(SOURCE_DIRECTORY, filename), "utf8");
  const questions = JSON.parse(source.replace(/^\uFEFF/, ""));
  preparedFiles.push({ filename, sourceDigest: digest(source), questions: questions.map(prepareQuestion) });
}

console.log(`Prepared ${units.length} unique translatable text segments.`);
if (process.argv.includes("--prepare-only")) {
  const unitFile = path.resolve(process.cwd(), ".cache/amc-translation-units.json");
  await mkdir(path.dirname(unitFile), { recursive: true });
  await writeFile(unitFile, `${JSON.stringify(units)}\n`, "utf8");
  console.log(`Wrote ${units.length} segments to ${path.relative(process.cwd(), unitFile)}.`);
  process.exit(0);
}
const cache = await readCache();
const translatedSegments = await fillTranslationCache(cache);
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
for (const { filename, sourceDigest, questions } of preparedFiles) {
  const output = questions.map((question) => resolveQuestion(question, cache));
  const destination = path.join(OUTPUT_DIRECTORY, filename);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
  console.log(`${filename}: ${output.length} questions (${sourceDigest.slice(0, 12)} source digest)`);
}
console.log(JSON.stringify({ files: FILES.length, questions: preparedFiles.reduce((total, file) => total + file.questions.length, 0), textSegments: units.length, translatedSegments }, null, 2));
