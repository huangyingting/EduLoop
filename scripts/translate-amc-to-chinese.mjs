import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { knownMathTranslation, protectedLatexSegments, replaceProtectedLatex, transformLatexText } from "./amc-latex.mjs";
import { collection, localeDirectory } from "./content-manifest.mjs";

const { files: FILES, sourceLocale: SOURCE_LOCALE, translatedLocales: [TRANSLATED_LOCALE] } = collection("amc");
const SOURCE_DIRECTORY = localeDirectory(SOURCE_LOCALE);
const OUTPUT_DIRECTORY = localeDirectory(TRANSLATED_LOCALE);
const CACHE_FILE = path.resolve(process.cwd(), ".cache/amc-zh-CN-translations.json");
const ENDPOINTS = [
  "https://translate.google.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t",
  "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t",
  "https://clients5.google.com/translate_a/t?client=it&sl=en&tl=zh-CN",
];
const MAX_REQUEST_CHARACTERS = 3_800;
const MAX_UNIT_CHARACTERS = 2_800;
const MIN_REQUEST_INTERVAL_MS = 100;
const EXACT_PROTECTION_MARKER = /⟪P(\d+)Q⟫/g;
const EXACT_LATEX_TEXT_MARKER = /⟪L(\d+)Q⟫/g;
const LATEX_TEXT_SYNTAX = /\\[$%&#_]\s*[0-9.,]*|\\[A-Za-z]+/g;
const MANGLED_TRANSLATION_MARKER = /(?<!⟪)[PL]\d+Q|A+(?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)+A+/i;
const USER_CONTENT_KEYS = ["title", "option_a", "option_b", "option_c", "option_d", "option_e"];
const LOCAL_TRANSLATIONS = new Map([
  ["in All Rows", "在所有行中"],
  ["of the time", "的时间"],
  ["~ Lion08 ~Theoneandonlymathman - Grammar mistakes", "~ Lion08 ~Theoneandonlymathman - Grammar mistakes"],
  ["~ cxsmi", "~ cxsmi"],
  ["~aop2014", "~aop2014"],
  ["~ AVRILAVIGNE", "~ AVRILAVIGNE"],
  ["~ab2024", "~ab2024"],
  ["~songmath20 Edited 5.1.2023", "~songmath20 Edited 5.1.2023"],
  ["~mathfan2020", "~mathfan2020"],
  ["~Ethanzhang1001", "~Ethanzhang1001"],
  ["~evanhliu2009", "~evanhliu2009"],
  ["~ eevee9406", "~ eevee9406"],
  ["~jb2015007", "~jb2015007"],
]);

function localTranslation(source) {
  const knownMath = knownMathTranslation(source);
  if (knownMath !== undefined) return knownMath;
  const exact = LOCAL_TRANSLATIONS.get(source);
  if (exact !== undefined) return exact;
  let match;
  if ((match = source.match(/^the first height is 21 (⟪L\d+Q⟫)more than the second$/))) {
    return `第一个高度比第二个高21${match[1]}`;
  }
  if (/^Leonard⟪L\d+Q⟫my⟪L\d+Q⟫dude$/.test(source)) return source;
  if ((match = source.match(/^Liliane has 20(⟪L\d+Q⟫)more soda than Alice$/))) {
    return `莉莉安的苏打水比爱丽丝多20${match[1]}`;
  }
  if ((match = source.match(/^Case (⟪L\d+Q⟫)(: )?$/))) return `情况 ${match[1]}${match[2] ?? ""}`;
  if ((match = source.match(/^(⟪L\d+Q⟫)of Students$/))) return `${match[1]}名学生`;
  if ((match = source.match(/^(⟪L\d+Q⟫)codes$/))) return `${match[1]}个代码`;
  if ((match = source.match(/^(⟪L\d+Q⟫)favorable permutations$/))) return `${match[1]}个有利排列`;
  if ((match = source.match(/^\((⟪L\d+Q⟫) each\)$/))) return `（每个${match[1]}）`;
  if ((match = source.match(/^(⟪L\d+Q⟫)of Ways$/))) return `${match[1]}种方式`;
  if ((match = source.match(/^(⟪L\d+Q⟫)of Tenors$/))) return `${match[1]}位男高音`;
  if ((match = source.match(/^(⟪L\d+Q⟫)of Basses$/))) return `${match[1]}位男低音`;
  if ((match = source.match(/^(⟪L\d+Q⟫)of Groups$/))) return `${match[1]}个组`;
  if ((match = source.match(/^Evaluate (⟪L\d+Q⟫)of Groups$/))) return `计算${match[1]}个组`;
  return undefined;
}

let nextProtectionId = 0;
let nextLatexTextProtectionId = 0;
let nextRequestAt = 0;
let googleUnavailableUntil = 0;
let bingSession;
const protections = new Map();
const latexTextProtections = new Map();
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

function latexTextProtectionIds(value) {
  return [...value.matchAll(EXACT_LATEX_TEXT_MARKER)].map((match) => Number(match[1])).sort((left, right) => left - right);
}

function hasMatchingProtectionMarkers(source, translated) {
  return JSON.stringify(protectionIds(source)) === JSON.stringify(protectionIds(translated))
    && JSON.stringify(latexTextProtectionIds(source)) === JSON.stringify(latexTextProtectionIds(translated))
    && !MANGLED_TRANSLATION_MARKER.test(translated);
}

function repairTranslationMarkers(source, translated) {
  let repaired = translated.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  const expected = [...source.matchAll(/⟪([PLB])(\d+)Q⟫/g)];
  for (const [, prefix, id] of expected) {
    const damaged = new RegExp(`(?:⟪)?${prefix}\\s*${id.split("").join("\\s*")}\\s*Q(?:⟫)?`, "g");
    repaired = repaired.replace(damaged, `⟪${prefix}${id}Q⟫`);
  }
  return repaired;
}

function canonicalProtectionMarkers(value) {
  return value.replace(/⟪([PL])\d+Q⟫/g, "⟪$1#Q⟫");
}

function migrateProtectionMarkerCache(cache) {
  const byCanonicalSource = new Map();
  for (const [source, translated] of cache) {
    const canonical = canonicalProtectionMarkers(source);
    if (!byCanonicalSource.has(canonical)) byCanonicalSource.set(canonical, { source, translated });
  }
  let migrated = 0;
  for (const unit of new Set(units)) {
    if (cache.has(unit)) continue;
    const previous = byCanonicalSource.get(canonicalProtectionMarkers(unit));
    if (!previous) continue;
    const oldMarkers = [...previous.source.matchAll(/⟪([PL])(\d+)Q⟫/g)];
    const newMarkers = [...unit.matchAll(/⟪([PL])(\d+)Q⟫/g)];
    if (oldMarkers.length !== newMarkers.length) continue;
    let translated = previous.translated;
    let compatible = true;
    oldMarkers.forEach((oldMarker, index) => {
      const newMarker = newMarkers[index];
      if (oldMarker[1] !== newMarker[1]) compatible = false;
      translated = translated.replaceAll(oldMarker[0], newMarker[0]);
    });
    if (!compatible || !translated.trim() || !hasMatchingProtectionMarkers(unit, translated)) continue;
    cache.set(unit, translated);
    migrated += 1;
  }
  return migrated;
}

function protectedContent(value) {
  return protectedLatexSegments(value).map((segment) => segment.value).sort();
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
  return transformLatexText(math, (content) => {
    if (!hasEnglish(content) || content.trimStart().startsWith("~")) return content;
    const protectedText = content.replace(LATEX_TEXT_SYNTAX, (syntax) => {
      const id = nextLatexTextProtectionId;
      nextLatexTextProtectionId += 1;
      latexTextProtections.set(id, syntax);
      return `⟪L${id}Q⟫`;
    });
    return registerUnit(protectedText);
  });
}

function protectContent(value) {
  return replaceProtectedLatex(value, (protectedValue, kind) => {
    const id = nextProtectionId;
    nextProtectionId += 1;
    const translatable = kind === "math" || kind === "environment";
    protections.set(id, translatable ? translatableLatex(protectedValue) : protectedValue);
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

async function createBingSession() {
  const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36";
  const response = await fetch("https://www.bing.com/translator", {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Bing session HTTP ${response.status}`);
  const page = await response.text();
  const ig = page.match(/IG:"([^"]+)/)?.[1];
  const iid = page.match(/data-iid="([^"]+)/)?.[1];
  const abusePrevention = page.match(/params_AbusePreventionHelper\s*=\s*(\[[^;]+\])/)?.[1];
  if (!ig || !iid || !abusePrevention) throw new Error("Bing translator session metadata missing");
  const [key, token] = JSON.parse(abusePrevention);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  return { cookie, ig, iid, key: String(key), token, userAgent };
}

async function requestBingTranslationChunk(value) {
  bingSession ??= await createBingSession();
  const body = new URLSearchParams({
    fromLang: "en",
    text: value,
    to: "zh-Hans",
    token: bingSession.token,
    key: bingSession.key,
    tryFetchingGenderDebiasedTranslations: "true",
  });
  const response = await fetch(`https://www.bing.com/ttranslatev3?isVertical=1&IG=${bingSession.ig}&IID=${bingSession.iid}.1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": bingSession.userAgent,
      Referer: "https://www.bing.com/translator",
      Cookie: bingSession.cookie,
    },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status === 401) bingSession = undefined;
  if (!response.ok) throw new Error(`Bing translation HTTP ${response.status}`);
  const payload = await response.json();
  const translated = payload?.[0]?.translations?.[0]?.text;
  if (!translated) throw new Error("Bing translation response was empty");
  return repairTranslationMarkers(value, translated);
}

async function requestBingTranslation(value) {
  if (value.length <= 900) return requestBingTranslationChunk(value);
  const chunks = [];
  let rest = value;
  while (rest.length > 900) {
    const candidate = rest.slice(0, 901);
    const boundary = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
    const end = boundary > 450 ? boundary + 1 : 900;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  const translated = [];
  for (const chunk of chunks) translated.push(await requestBingTranslationChunk(chunk));
  return translated.join("");
}

async function requestTranslation(value) {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    for (const endpoint of Date.now() >= googleUnavailableUntil ? ENDPOINTS : []) {
      try {
        const body = new URLSearchParams({ q: value });
        const response = await fetch(endpoint, {
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
        return repairTranslationMarkers(value, translated);
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.message === "HTTP 429") {
          googleUnavailableUntil = Date.now() + 10 * 60_000;
          break;
        }
      }
    }
    try {
      return await requestBingTranslation(value);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 20) {
      const rateLimited = lastError instanceof Error && lastError.message === "HTTP 429";
      const delay = rateLimited
        ? Math.min(180_000, 30_000 * attempt)
        : Math.min(30_000, 500 * 2 ** (attempt - 1));
      if (rateLimited) console.log(`Translation services rate-limited; retrying in ${Math.round(delay / 1_000)}s (attempt ${attempt}/20).`);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Translation request failed");
}

function taggedBatch(values) {
  // Keep markers on their own lines. When a marker is attached to English
  // prose, translation services can move it to the end of the Chinese phrase
  // and make the batch boundary ambiguous.
  return values.map((value, index) => `⟪B${index}Q⟫\n${value}`).join("\n");
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

async function translateAroundProtectedContent(value) {
  const pieces = value.split(/(⟪P\d+Q⟫)/g);
  const textPieces = pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => piece && !/^⟪P\d+Q⟫$/.test(piece));
  const translations = await translateBatch(textPieces.map(({ piece }) => piece));
  textPieces.forEach(({ index }, translationIndex) => {
    pieces[index] = translations[translationIndex];
  });
  return pieces.join("");
}

async function fillTranslationCache(cache) {
  const migrated = migrateProtectionMarkerCache(cache);
  if (migrated) console.log(`Reused ${migrated} cached translations after protected-math renumbering.`);
  for (const unit of new Set(units)) {
    const translated = localTranslation(unit);
    if (translated !== undefined) cache.set(unit, translated);
  }
  let invalidated = 0;
  for (const unit of new Set(units)) {
    const translated = cache.get(unit);
    if (translated !== undefined && (!translated.trim() || !hasMatchingProtectionMarkers(unit, translated))) {
      cache.delete(unit);
      invalidated += 1;
    }
  }
  if (invalidated) console.log(`Discarded ${invalidated} cached translations with damaged placeholders.`);
  if (migrated || invalidated) await saveCache(cache);
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
    for (let index = 0; index < translations.length; index += 1) {
      let translation = translations[index];
      if (!translation.trim() || !hasMatchingProtectionMarkers(batch[index], translation)) {
        translation = await translateAroundProtectedContent(batch[index]);
      }
      if (!translation.trim() || !hasMatchingProtectionMarkers(batch[index], translation)) {
        throw new Error(`Translation service damaged protected content in segment ${digest(batch[index]).slice(0, 12)}`);
      }
      cache.set(batch[index], translation);
    }
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
  const resolveRegisteredUnits = (template) => template.replace(/⟪T(\d+)Q⟫/g, (_, rawId) => {
    const source = units[Number(rawId)];
    const translated = cache.get(source);
    if (!translated) throw new Error(`Missing nested translation for segment ${rawId}`);
    return translated;
  }).replace(EXACT_LATEX_TEXT_MARKER, (_, rawId) => {
    const syntax = latexTextProtections.get(Number(rawId));
    if (syntax === undefined) throw new Error(`Missing protected LaTeX text content ${rawId}`);
    return syntax;
  });
  const expectedProtectedContent = protectionIds(translatedTemplate).map((id) => {
    const protectedValue = protections.get(id);
    if (protectedValue === undefined) throw new Error(`Missing protected content ${id}`);
    return resolveRegisteredUnits(protectedValue);
  }).sort();
  let resolved = translatedTemplate.replace(EXACT_PROTECTION_MARKER, (_, rawId) => {
    const protectedValue = protections.get(Number(rawId));
    if (protectedValue === undefined) throw new Error(`Missing protected content ${rawId}`);
    return protectedValue;
  });
  resolved = resolveRegisteredUnits(resolved);
  if (MANGLED_TRANSLATION_MARKER.test(resolved) || /⟪[PLTB]\d+Q⟫/.test(resolved)) {
    throw new Error("Translation contains an unresolved placeholder");
  }
  const actualProtectedContent = protectedContent(resolved);
  if (JSON.stringify(expectedProtectedContent) !== JSON.stringify(actualProtectedContent)) {
    const mismatchIndex = expectedProtectedContent.findIndex((value, index) => value !== actualProtectedContent[index]);
    throw new Error(`Translation changed protected math or figure content: expected ${JSON.stringify(expectedProtectedContent[mismatchIndex])}, received ${JSON.stringify(actualProtectedContent[mismatchIndex])} near ${JSON.stringify(resolved.slice(0, 160))}`);
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
