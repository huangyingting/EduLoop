import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { load, type CheerioAPI } from "cheerio";
import { Text, type Element } from "domhandler";
import { contentCollection } from "../src/lib/content-manifest";

const AOPS_ORIGIN = "https://artofproblemsolving.com";
const ARCHIVE_ORIGIN = "https://web.archive.org";
const RANDOM_MATH_ORIGIN = "https://wiki.randommath.com";
const POSHEN_LOH_ORIGIN = "https://live.poshenloh.com";
const DEFAULT_SNAPSHOT = "20260604120032";
const REQUEST_INTERVAL_MS = 500;
const MAX_ATTEMPTS = 8;

type CompetitionKey = "amc8" | "amc10" | "amc12";
type CompetitionLevel = "AMC-8" | "AMC-10" | "AMC-12";

type CompetitionConfig = {
  key: CompetitionKey;
  number: 8 | 10 | 12;
  level: CompetitionLevel;
  contestPattern: RegExp;
};

const COMPETITIONS: Record<CompetitionKey, CompetitionConfig> = {
  amc8: {
    key: "amc8", number: 8, level: "AMC-8",
    contestPattern: /^(?:(?:19|20)\d{2})_(?:AJHSME|AMC_8)$/,
  },
  amc10: {
    key: "amc10", number: 10, level: "AMC-10",
    contestPattern: /^20\d{2}_(?:Fall_)?AMC_10[ABP]$/,
  },
  amc12: {
    key: "amc12", number: 12, level: "AMC-12",
    contestPattern: /^20\d{2}_(?:Fall_)?AMC_12[ABP]$/,
  },
};

function competitionFromArgs() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--competition");
  const key = (index >= 0 ? args[index + 1] : "amc10") as CompetitionKey;
  const competition = COMPETITIONS[key];
  if (!competition) throw new Error(`Unsupported competition: ${key}. Use amc8, amc10, or amc12.`);
  return competition;
}

const COMPETITION = competitionFromArgs();
const AMC_COLLECTION = contentCollection("amc");
if (!AMC_COLLECTION.files.includes(`${COMPETITION.key}.json`)) {
  throw new Error(`${COMPETITION.key}.json is not declared in the AMC content collection`);
}
const INDEX_URL = `${AOPS_ORIGIN}/wiki/index.php/AMC_${COMPETITION.number}_Problems_and_Solutions`;
const CACHE_DIRECTORY = path.resolve(process.cwd(), `.cache/${COMPETITION.key}`);
const OUTPUT_FILE = path.resolve(process.cwd(), "data", AMC_COLLECTION.sourceLocale, `${COMPETITION.key}.json`);
const USER_AGENT = `EduLoop${COMPETITION.key.toUpperCase()}Importer/1.0 (authorized curriculum archive import)`;

type SourceQuestion = {
  id: string;
  type: string;
  grade_band: string;
  difficulty: string;
  grade: string;
  course: string;
  paper: string;
  online_test: boolean;
  option_split: boolean;
  quality: string;
  question_info: { raw_content: Record<string, string> };
  answer_info: { raw_content: string };
  solution_info: Array<{ solution_info: string }>;
  children: unknown[];
};

type ScrapedQuestion = {
  contest: string;
  problemNumber: number;
  sourceUrl: string;
  question: SourceQuestion;
};

type CliOptions = {
  refresh: boolean;
  dryRun: boolean;
  contest: string | null;
  snapshot: string;
};

let nextRequestAt = 0;
let globalPauseUntil = 0;
let requestGate = Promise.resolve();

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] ?? null : null;
  };
  return {
    refresh: args.includes("--refresh"),
    dryRun: args.includes("--dry-run"),
    contest: valueAfter("--contest"),
    snapshot: valueAfter("--snapshot") ?? DEFAULT_SNAPSHOT,
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rateGate() {
  const turn = requestGate.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now(), globalPauseUntil - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
  });
  requestGate = turn.catch(() => undefined);
  await turn;
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  const errors: Array<{ index: number; error: unknown }> = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        errors.push({ index, error });
      }
    }
  }));
  if (errors.length) {
    const first = errors.sort((left, right) => left.index - right.index)[0];
    const message = first.error instanceof Error ? first.error.message : String(first.error);
    throw new Error(`Item ${first.index + 1}: ${message}`, { cause: first.error });
  }
  return results;
}

function retryDelay(attempt: number) {
  return Math.min(20_000, 600 * 2 ** Math.max(0, attempt - 1)) + Math.floor(Math.random() * 250);
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

async function fetchText(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await rateGate();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.text();
      if (response.ok) return body;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) throw new Error(`HTTP ${response.status} for ${url}`);
      const delay = retryAfterMilliseconds(response.headers.get("retry-after")) ?? retryDelay(attempt);
      if (response.status === 429) globalPauseUntil = Math.max(globalPauseUntil, Date.now() + delay);
      lastError = new Error(`HTTP ${response.status} for ${url}`);
      if (attempt < MAX_ATTEMPTS) await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(retryDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch ${url}`);
}

function replayUrl(sourceUrl: string, timestamp: string) {
  return `${ARCHIVE_ORIGIN}/web/${timestamp}id_/${sourceUrl}`;
}

function isArchivedWikiPage(html: string) {
  const lower = html.toLowerCase();
  return html.includes("mw-parser-output")
    && !lower.includes("attention required! | cloudflare")
    && !lower.includes("performing security verification")
    && !lower.includes("wayback machine doesn't have that page archived");
}

function sourceUrlVariants(sourceUrl: string) {
  const variants = [sourceUrl];
  const parsed = new URL(sourceUrl);
  const title = parsed.searchParams.get("title");
  if (title) {
    variants.push(`${AOPS_ORIGIN}/wiki/index.php/${title}`);
    variants.push(`http://www.artofproblemsolving.com/Wiki/index.php/${title}`);
  }
  return [...new Set(variants)];
}

async function latestSnapshots(sourceUrl: string) {
  const snapshots: Array<{ timestamp: string; original: string }> = [];
  for (const variant of sourceUrlVariants(sourceUrl)) {
    const cdx = new URL(`${ARCHIVE_ORIGIN}/cdx/search/cdx`);
    cdx.searchParams.set("url", variant);
    cdx.searchParams.set("output", "json");
    cdx.searchParams.set("filter", "statuscode:200");
    cdx.searchParams.append("filter", "mimetype:text/html");
    cdx.searchParams.set("fl", "timestamp,original");
    cdx.searchParams.set("collapse", "digest");
    cdx.searchParams.set("limit", "1");
    cdx.searchParams.set("sort", "reverse");
    const rows = JSON.parse(await fetchText(cdx.href)) as string[][];
    if (Array.isArray(rows) && rows.length >= 2) snapshots.push({ timestamp: rows[1][0], original: rows[1][1] });
  }
  if (!snapshots.length) throw new Error(`No archived snapshot for ${sourceUrl}`);
  return snapshots.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function pageMatchesCacheKey(html: string, cacheKey: string) {
  try {
    if (cacheKey.endsWith("-answers")) return parseAnswerKey(html).length === 25;
    if (/-problem-\d+$/.test(cacheKey)) return Boolean(parseProblemPage(html).solutions.length);
    if (cacheKey === "index") return parseContests(html).length > 0;
    return true;
  } catch (error) {
    if (process.env.AMC_DEBUG_CACHE === "1") {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${cacheKey}: cached page rejected: ${message}`);
    }
    return false;
  }
}

async function archivedPage(sourceUrl: string, cacheKey: string, options: CliOptions, searchSnapshots = true) {
  const cacheFile = path.join(CACHE_DIRECTORY, `${cacheKey}.html`);
  if (!options.refresh) {
    try {
      const cached = await readFile(cacheFile, "utf8");
      if (isArchivedWikiPage(cached) && pageMatchesCacheKey(cached, cacheKey)) return cached;
    } catch {
      // A cache miss is expected on the first run.
    }
  }

  let html = await fetchText(replayUrl(sourceUrl, options.snapshot)).catch(() => "");
  if (searchSnapshots && (!isArchivedWikiPage(html) || !pageMatchesCacheKey(html, cacheKey))) {
    html = "";
    for (const closest of await latestSnapshots(sourceUrl)) {
      const candidate = await fetchText(replayUrl(closest.original, closest.timestamp)).catch(() => "");
      if (!isArchivedWikiPage(candidate) || !pageMatchesCacheKey(candidate, cacheKey)) continue;
      html = candidate;
      break;
    }
  }
  if (!isArchivedWikiPage(html) || !pageMatchesCacheKey(html, cacheKey)) {
    throw new Error(`No complete archived article found: ${sourceUrl}`);
  }
  await mkdir(CACHE_DIRECTORY, { recursive: true });
  await writeFile(cacheFile, html, "utf8");
  return html;
}

function headingText($: CheerioAPI, heading: Element) {
  return $(heading).text().replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function headingLevel(heading: Element) {
  return Number(heading.tagName.slice(1));
}

function sectionHtml($: CheerioAPI, heading: Element) {
  const level = headingLevel(heading);
  const parts: string[] = [];
  for (const node of $(heading).nextAll().toArray()) {
    if (/^h[1-6]$/.test(node.tagName) && headingLevel(node) <= level) break;
    parts.push($.html(node));
  }
  return parts.join("");
}

function problemSectionHtml($: CheerioAPI, heading: Element) {
  const level = headingLevel(heading);
  const parts: string[] = [];
  for (const node of $(heading).nextAll().toArray()) {
    if (/^h[1-6]$/.test(node.tagName)) {
      if (headingLevel(node) <= level || /\bsolution\b/i.test(headingText($, node))) break;
    }
    parts.push($.html(node));
  }
  return parts.join("");
}

function absoluteAssetUrl(source: string) {
  if (source.startsWith("//")) return `https:${source}`;
  if (source.startsWith("/")) return `${AOPS_ORIGIN}${source}`;
  return source;
}

const AMC_SOURCE_ATTRIBUTION = /(?:---\s*)?\*?The problems and solutions on this page are the property of the MAA's (?:American Mathematics Competitions|\[American Mathematics Competitions\]\(https?:\/\/[^)]+\))\*?(?:Your content here)?/gi;

function stripSourceBoilerplate(value: string) {
  return value
    .replace(AMC_SOURCE_ATTRIBUTION, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textFromHtml(html: string) {
  const $ = load(`<div id="extract-root">${html}</div>`, undefined, false);
  const root = $("#extract-root");
  root.find("script,style,.mw-editsection").remove();
  root.find("img").each((_, image) => {
    const element = $(image);
    const alt = (element.attr("alt") ?? "").trim();
    const source = absoluteAssetUrl(element.attr("src") ?? "");
    const diagramSource = /^\[(?:asy|tikz)\]/i.test(alt);
    const latex = !diagramSource && (element.hasClass("latex") || element.hasClass("latexcenter") || /^\$|^\\\[/.test(alt));
    element.replaceWith(new Text(latex && alt ? alt : source ? `\n[Figure: ${source}]\n` : alt));
  });
  root.find("br").replaceWith("\n");
  root.find("td,th").each((_, cell) => { $(cell).append(" | "); });
  root.find("p,li,dl,dd,dt,tr,table,blockquote,h3,h4,pre").each((_, block) => { $(block).append("\n"); });
  return stripSourceBoilerplate(root.text()
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `$${math}$`)
    .replace(/\$\\\$\$(\d+(?:\.\d+)?)\$/g, "\\\$$1")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n"));
}

type Marker = { label: string; start: number; end: number };

function choiceMarkers(text: string) {
  const pattern = /(?:\\left)?\s*[\[(]\s*\\(?:textbf|mathbf|mathrm|text)\s*\{\s*([A-E])\s*\}\s*(?:\\right)?\s*[\])]|\\(?:textbf|mathbf|mathrm|text)\s*\{\s*(?:\\left)?\s*[([]?\s*([A-E])\s*[)\]]?\s*\}?|(?:^|[\s$])(?:\\left)?\s*\(\s*([A-E])\s*\)/g;
  const all: Marker[] = [];
  for (const match of text.matchAll(pattern)) {
    all.push({ label: match[1] ?? match[2] ?? match[3], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  for (let start = 0; start <= all.length - 5; start += 1) {
    const candidate = all.slice(start, start + 5);
    if (candidate.every((marker, index) => marker.label === String.fromCharCode(65 + index))) return candidate;
  }
  return [];
}

function cleanOption(value: string, mathBlock: boolean) {
  let cleaned = value
    .replace(/^\s*(?:\\qquad|\\quad|\\;|\\,)+\s*/, "")
    .replace(/\s*(?:\\qquad|\\quad|\\;|\\,)+\s*$/, "")
    .replace(/^\s*\$+|\$+\s*$/g, "")
    .replace(/\\+\s*$/, "")
    .trim();
  const openBraces = (cleaned.match(/\{/g) ?? []).length;
  const closeBraces = (cleaned.match(/\}/g) ?? []).length;
  if (closeBraces > openBraces && cleaned.endsWith("}")) cleaned = cleaned.slice(0, -1).trim();
  if (mathBlock && cleaned && !cleaned.startsWith("$")) cleaned = `$${cleaned}$`;
  const mathDelimiters = [...cleaned.matchAll(/(?<!\\)\$/g)].length;
  if (mathBlock && mathDelimiters > 1 && mathDelimiters % 2 === 1 && cleaned.endsWith("$$")) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

function parseChoices(text: string) {
  const markers = choiceMarkers(text);
  if (markers.length !== 5) return null;
  const before = text.slice(0, markers[0].start);
  const mathBlock = (before.match(/(?<!\\)\$/g)?.length ?? 0) % 2 === 1;
  const options = markers.map((marker, index) => {
    let end = markers[index + 1]?.start ?? text.length;
    if (mathBlock && index === markers.length - 1) {
      const closingDelimiter = text.slice(marker.end).search(/(?<!\\)\$/);
      if (closingDelimiter >= 0) end = marker.end + closingDelimiter;
    }
    return cleanOption(text.slice(marker.end, end), mathBlock);
  });
  if (options.some((option) => !option)) return null;
  return {
    stem: before.replace(/\s*\$+\s*$/, "").trim(),
    options,
  };
}

function normalizedFingerprint(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function hasTextIntegrityIssue(value: string) {
  let dollars = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "$") continue;
    let precedingSlashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) precedingSlashes += 1;
    if (precedingSlashes % 2 === 0) dollars += 1;
  }
  return dollars % 2 !== 0 || /\[(?:asy|tikz)[\s\S]*?\[\/(?:asy|tikz)\]/i.test(value) || /<\/?(?:html|body|script|style)\b/i.test(value);
}

function textIntegritySummary(value: string) {
  const dollarOffsets = [...value.matchAll(/(?<!\\)\$/g)].map((match) => match.index ?? 0);
  const firstSuspicious = dollarOffsets.find((_, index) => index % 2 === dollarOffsets.length % 2);
  const start = Math.max(0, (firstSuspicious ?? 0) - 80);
  const excerpt = value.slice(start, start + 240).replace(/\s+/g, " ");
  return `malformed text or math (${dollarOffsets.length} math delimiters): ${JSON.stringify(excerpt)}`;
}

function digest(value: string, algorithm: "md5" | "sha256" = "sha256") {
  return createHash(algorithm).update(value).digest("hex");
}

function parseProblemPage(html: string) {
  const $ = load(html);
  const root = $(".mw-parser-output").first();
  if (!root.length) throw new Error("Missing MediaWiki article body");
  const headings = root.find("h2,h3,h4").toArray();
  const problemHeading = headings.find((heading) => /^problem(?:\s+\d+)?$/i.test(headingText($, heading)));
  const firstArticleHeading = root.children("h2,h3,h4").first().get(0);
  const problemHtml = problemHeading
    ? problemSectionHtml($, problemHeading)
    : root.children().toArray()
      .slice(0, firstArticleHeading ? root.children().toArray().indexOf(firstArticleHeading) : 0)
      .filter((node) => !$(node).is(".toc"))
      .map((node) => $.html(node))
      .join("");
  if (!problemHtml.trim()) throw new Error("Missing Problem section");
  const problemText = textFromHtml(problemHtml);
  let parsedChoices = parseChoices(problemText);

  if (!parsedChoices) {
    const fragment = load(`<div id="problem-fragment">${problemHtml}</div>`, undefined, false);
    const latexCandidates = fragment("#problem-fragment img").toArray()
      .map((image) => fragment(image).attr("alt") ?? "")
      .filter(Boolean);
    for (const candidate of [...latexCandidates, latexCandidates.join(" ")]) {
      parsedChoices = parseChoices(candidate);
      if (!parsedChoices) continue;
      const markerSource = latexCandidates.find((item) => choiceMarkers(item).length === 5);
      if (markerSource) {
        fragment("#problem-fragment img").filter((_, image) => fragment(image).attr("alt") === markerSource).remove();
        parsedChoices.stem = textFromHtml(fragment("#problem-fragment").html() ?? "");
      } else {
        parsedChoices.stem = problemText.slice(0, problemText.indexOf(candidate)).trim() || parsedChoices.stem;
      }
      break;
    }
  }
  if (!parsedChoices || parsedChoices.options.length !== 5) throw new Error("Unable to extract five answer choices");
  if (!parsedChoices.stem) throw new Error("Problem stem is empty");
  const malformedProblemField = [
    ["stem", parsedChoices.stem],
    ...parsedChoices.options.map((option, index) => [`option_${String.fromCharCode(65 + index)}`, option]),
  ].find(([, value]) => hasTextIntegrityIssue(value));
  if (malformedProblemField) {
    throw new Error(`Malformed text or math in ${malformedProblemField[0]}: ${textIntegritySummary(malformedProblemField[1])}`);
  }

  const solutionFingerprints = new Set<string>();
  const solutions: string[] = [];
  for (const heading of headings) {
    const label = headingText($, heading);
    if (!/\bsolution\b/i.test(label) || /video|see also/i.test(label)) continue;
    const level = headingLevel(heading);
    const hasNestedSolution = $(heading).nextUntil(`h1,h2${level >= 3 ? ",h3" : ""}${level >= 4 ? ",h4" : ""}`)
      .filter("h2,h3,h4")
      .toArray()
      .some((nested) => /\bsolution\b/i.test(headingText($, nested)));
    if (hasNestedSolution) continue;
    const solution = textFromHtml(sectionHtml($, heading));
    if (normalizedFingerprint(solution).length < 20 || hasTextIntegrityIssue(solution)) continue;
    const fingerprint = digest(normalizedFingerprint(solution));
    if (solutionFingerprints.has(fingerprint)) continue;
    solutionFingerprints.add(fingerprint);
    solutions.push(solution);
  }
  if (!solutions.length) throw new Error("No textual solution sections found");
  return { stem: parsedChoices.stem, options: parsedChoices.options, solutions };
}

function randomMathUrlVariants(contest: string, problemNumber: number) {
  const match = /^(?:(19|20)(\d{2}))_(?:(Fall_)?AMC_(?:10|12)([ABP])|AJHSME|AMC_8)$/.exec(contest);
  if (!match) return [];
  const year = `${match[1]}${match[2]}`;
  const fall = match[3];
  const part = match[4];
  const contestPaths = fall
    ? [`${year}-fall`, `${year}/fall`]
    : [year];
  if (COMPETITION.key === "amc8") {
    return contestPaths.flatMap((contestPath) => [
      `${RANDOM_MATH_ORIGIN}/amc8/${contestPath}/problem-${problemNumber}`,
      `${RANDOM_MATH_ORIGIN}/amc8/${contestPath}/part-a/problem-${problemNumber}`,
    ]);
  }
  return contestPaths.map((contestPath) => (
    `${RANDOM_MATH_ORIGIN}/${COMPETITION.key}/${contestPath}/part-${part.toLowerCase()}/problem-${problemNumber}`
  ));
}

function textFromRandomMath(root: ReturnType<CheerioAPI>) {
  root.find("script,style").remove();
  root.find(".katex").each((_, math) => {
    const element = root.find(math);
    const mathElement = element.find("math").first();
    const sourceText = mathElement.contents().toArray()
      .filter((node) => node.type === "text")
      .map((node) => "data" in node ? node.data : "")
      .join("")
      .trim();
    const value = (sourceText || mathElement.children("mrow").first().text()).replace(/\s+/g, " ").trim();
    element.replaceWith(new Text(value ? `$${value}$` : ""));
  });
  root.find("img").each((_, image) => {
    const element = root.find(image);
    const source = absoluteAssetUrl(element.attr("src") ?? "");
    element.replaceWith(source ? `\n[Figure: ${source}]\n` : element.attr("alt") ?? "");
  });
  root.find("br").replaceWith("\n");
  root.find("p,li,table,tr,h1,h2,h3,h4,blockquote").each((_, block) => { root.find(block).append("\n"); });
  return stripSourceBoilerplate(root.text()
    .replace(/\u00a0/g, " ")
    .replace(/\bSuppose that\s+Suppose that\b/g, "Suppose that")
    .replace(/\bdi erence(s?)\b/gi, "difference$1")
    .replace(/\bdi erent\b/gi, "different")
    .replace(/\bo ers\b/gi, "offers")
    .replace(/\bo er\b/gi, "offer")
    .replace(/\brst\b/gi, "first")
    .replace(/\bve\b/gi, "five")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n"));
}

function parseRandomMathProblem(html: string) {
  const $ = load(html);
  const template = $("template[slot='contents']").first();
  if (!template.length) throw new Error("Missing Random Math article body");
  const templateContent = template.contents().first();
  if (!templateContent.length) throw new Error("Missing Random Math template content");
  templateContent.find("img").each((_, image) => {
    const element = templateContent.find(image);
    const source = element.attr("src") ?? "";
    if (source.startsWith("/")) element.attr("src", `${RANDOM_MATH_ORIGIN}${source}`);
  });
  const text = textFromRandomMath(templateContent);
  const problemAt = text.indexOf("Problem:");
  const choicesAt = text.indexOf("Answer Choices:", problemAt + 1);
  const afterChoices = text.slice(choicesAt + "Answer Choices:".length);
  const solutionMarker = /(?:^|\n)(?:¶\s*)?Solution(?:\s+\d+)?:\s*/.exec(afterChoices);
  if (problemAt < 0 || choicesAt < 0 || !solutionMarker) throw new Error("Missing Random Math content markers");
  const stem = text.slice(problemAt + "Problem:".length, choicesAt).trim();
  const choiceText = afterChoices.slice(0, solutionMarker.index).trim();
  const markers = [...choiceText.matchAll(/(?:^|\n)\s*([A-E])\.\s*/g)];
  if (markers.length !== 5 || markers.some((marker, index) => marker[1] !== String.fromCharCode(65 + index))) {
    throw new Error("Unable to extract five Random Math answer choices");
  }
  const options = markers.map((marker, index) => choiceText.slice(
    (marker.index ?? 0) + marker[0].length,
    markers[index + 1]?.index ?? choiceText.length,
  ).trim());
  const solutionBlock = afterChoices.slice(solutionMarker.index + solutionMarker[0].length);
  const solutions = solutionBlock.split(/\n(?:¶\s*)?Solution(?:\s+\d+)?:\s*/)
    .map((solution) => solution.trim())
    .filter((solution) => normalizedFingerprint(solution).length >= 20);
  const uniqueSolutions = [...new Map(solutions.map((solution) => [normalizedFingerprint(solution), solution])).values()];
  if (!stem || options.some((option) => !option) || !uniqueSolutions.length) {
    throw new Error("Incomplete Random Math problem");
  }
  if ([stem, ...options, ...uniqueSolutions].some(hasTextIntegrityIssue)) {
    throw new Error("Malformed text or math in Random Math content");
  }
  return { stem, options, solutions: uniqueSolutions };
}

async function randomMathProblem(contest: string, problemNumber: number, options: CliOptions) {
  const cacheFile = path.join(CACHE_DIRECTORY, `${contest}-problem-${problemNumber}-randommath.html`);
  if (!options.refresh) {
    try {
      const cached = await readFile(cacheFile, "utf8");
      parseRandomMathProblem(cached);
      return { html: cached, sourceUrl: randomMathUrlVariants(contest, problemNumber)[0] };
    } catch {
      // Continue through the fallback URL variants.
    }
  }
  for (const sourceUrl of randomMathUrlVariants(contest, problemNumber)) {
    const html = await fetchText(sourceUrl).catch(() => "");
    try {
      parseRandomMathProblem(html);
      await writeFile(cacheFile, html, "utf8");
      return { html, sourceUrl };
    } catch {
      // Try the next known Random Math URL layout.
    }
  }
  throw new Error(`No complete fallback article found for ${contest} problem ${problemNumber}`);
}

async function cachedRandomMathProblem(contest: string, problemNumber: number, options: CliOptions) {
  if (options.refresh) return null;
  const cacheFile = path.join(CACHE_DIRECTORY, `${contest}-problem-${problemNumber}-randommath.html`);
  try {
    const html = await readFile(cacheFile, "utf8");
    parseRandomMathProblem(html);
    return { html, sourceUrl: randomMathUrlVariants(contest, problemNumber)[0] };
  } catch {
    return null;
  }
}

function parseAnswerKey(html: string) {
  const $ = load(html);
  const candidates = $(".mw-parser-output ol").toArray().map((list) => $(list).children("li").toArray()
    .map((item) => $(item).text().trim().toUpperCase())
    .filter((answer) => /^[A-E]$/.test(answer)));
  const answers = candidates.find((items) => items.length === 25);
  if (!answers) throw new Error(`Expected 25 answers; found ${Math.max(0, ...candidates.map((items) => items.length))}`);
  return answers;
}

function poshenLohAnswerUrls(contest: string) {
  const match = /^((?:19|20)\d{2})_(?:(Fall_)?AMC_(?:8|10|12)([ABP]?)|AJHSME)$/.exec(contest);
  if (!match) return [];
  const [, year, fall, part] = match;
  const labels = COMPETITION.key === "amc8"
    ? [year]
    : fall
      ? [`${year}Fall${part}`, `${year}${part}Fall`, `${year}F${part}`]
      : [`${year}${part}`];
  return labels.map((label) => `${POSHEN_LOH_ORIGIN}/past-contests/${COMPETITION.key}/${label}/answers`);
}

function parsePoshenLohAnswerKey(html: string) {
  const $ = load(html);
  const byNumber = new Map<number, string>();
  $(`a[href*='/past-contests/${COMPETITION.key}/'][href*='/problem/']`).each((_, anchor) => {
    const href = $(anchor).attr("href") ?? "";
    const match = /\/problem\/(\d+)\/?$/.exec(href);
    const answer = $(anchor).parent().find("strong").first().text().trim().toUpperCase();
    if (match && /^[A-E]$/.test(answer)) byNumber.set(Number(match[1]), answer);
  });
  const answers = Array.from({ length: 25 }, (_, index) => byNumber.get(index + 1) ?? "");
  if (answers.some((answer) => !answer)) throw new Error(`Expected 25 fallback answers; found ${byNumber.size}`);
  return answers;
}

async function cachedPoshenLohAnswerKey(contest: string, options: CliOptions) {
  if (options.refresh) return null;
  const cacheFile = path.join(CACHE_DIRECTORY, `${contest}-answers-poshenloh.html`);
  try {
    return parsePoshenLohAnswerKey(await readFile(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

async function poshenLohAnswerKey(contest: string, options: CliOptions) {
  const cacheFile = path.join(CACHE_DIRECTORY, `${contest}-answers-poshenloh.html`);
  const cached = await cachedPoshenLohAnswerKey(contest, options);
  if (cached) return cached;
  for (const sourceUrl of poshenLohAnswerUrls(contest)) {
    const html = await fetchText(sourceUrl).catch(() => "");
    try {
      const answers = parsePoshenLohAnswerKey(html);
      await writeFile(cacheFile, html, "utf8");
      return answers;
    } catch {
      // Try the next known fall-contest URL layout.
    }
  }
  throw new Error(`No complete fallback answer key found for ${contest}`);
}

function poshenLohProblemUrls(contest: string, problemNumber: number) {
  return poshenLohAnswerUrls(contest).map((url) => url.replace(/\/answers$/, `/problem/${problemNumber}`));
}

function textFromPoshenLohSource(value: string) {
  const $ = load(`<div id="poshen-source">${value}</div>`, undefined, false);
  const root = $("#poshen-source");
  root.find("img").each((_, image) => {
    const element = $(image);
    const rawSource = element.attr("src") ?? "";
    const source = rawSource.startsWith("/") ? `${POSHEN_LOH_ORIGIN}${rawSource}` : rawSource;
    element.replaceWith(source ? `\n[Figure: ${source}]\n` : element.attr("alt") ?? "");
  });
  root.find("br").replaceWith("\n");
  root.find("p,li,table,tr,blockquote").each((_, block) => { $(block).append("\n"); });
  return stripSourceBoilerplate(root.text()
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `$${math}$`)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n"));
}

function parsePoshenLohProblem(html: string) {
  const $ = load(html);
  const rawData = $("#__NEXT_DATA__").text();
  if (!rawData) throw new Error("Missing Po-Shen Loh problem data");
  const page = JSON.parse(rawData) as {
    props?: { pageProps?: { q?: Record<string, unknown> } };
  };
  const problem = page.props?.pageProps?.q;
  if (!problem) throw new Error("Missing Po-Shen Loh problem record");
  const stem = textFromPoshenLohSource(String(problem.question ?? ""));
  const options = ["a", "b", "c", "d", "e"].map((label) => textFromPoshenLohSource(String(problem[label] ?? "")));
  const solution = textFromPoshenLohSource(String(problem.solutions ?? ""));
  if (!stem || options.some((option) => !option) || normalizedFingerprint(solution).length < 20) {
    throw new Error("Incomplete Po-Shen Loh problem");
  }
  return { stem, options, solutions: [solution] };
}

async function cachedPoshenLohProblem(contest: string, problemNumber: number, options: CliOptions) {
  if (options.refresh) return null;
  const cacheFile = path.join(CACHE_DIRECTORY, `${contest}-problem-${problemNumber}-poshenloh.html`);
  try {
    const html = await readFile(cacheFile, "utf8");
    parsePoshenLohProblem(html);
    return { html, sourceUrl: poshenLohProblemUrls(contest, problemNumber)[0] };
  } catch {
    return null;
  }
}

async function poshenLohProblem(contest: string, problemNumber: number, options: CliOptions) {
  const cached = await cachedPoshenLohProblem(contest, problemNumber, options);
  if (cached) return cached;
  const cacheFile = path.join(CACHE_DIRECTORY, `${contest}-problem-${problemNumber}-poshenloh.html`);
  for (const sourceUrl of poshenLohProblemUrls(contest, problemNumber)) {
    const html = await fetchText(sourceUrl).catch(() => "");
    try {
      parsePoshenLohProblem(html);
      await writeFile(cacheFile, html, "utf8");
      return { html, sourceUrl };
    } catch {
      // Try the next known fall-contest URL layout.
    }
  }
  throw new Error(`No complete Po-Shen Loh problem found for ${contest} problem ${problemNumber}`);
}

function parseContests(html: string) {
  const $ = load(html);
  const contests = new Set<string>();
  $(".mw-parser-output a[title]").each((_, anchor) => {
    const title = ($(anchor).attr("title") ?? "").replace(/ /g, "_");
    if (COMPETITION.contestPattern.test(title)) contests.add(title);
  });
  return [...contests].sort((left, right) => {
    const leftYear = Number(left.slice(0, 4));
    const rightYear = Number(right.slice(0, 4));
    return leftYear - rightYear || left.localeCompare(right);
  });
}

function displayContest(contest: string) {
  return contest.replaceAll("_", " ");
}

function contestIsAvailable(contest: string, now = new Date()) {
  const year = Number(contest.slice(0, 4));
  if (!Number.isInteger(year)) return false;
  if (COMPETITION.key === "amc8") return year <= now.getUTCFullYear();
  const currentContestSeasonHasStarted = now.getUTCMonth() >= 10;
  return year < now.getUTCFullYear() || (year === now.getUTCFullYear() && currentContestSeasonHasStarted);
}

function sourceDifficulty(problemNumber: number) {
  return problemNumber <= 10 ? "容易" : problemNumber <= 20 ? "一般" : "困难";
}

function makeQuestion(contest: string, problemNumber: number, answer: string, parsed: ReturnType<typeof parseProblemPage>) {
  const rawContent: Record<string, string> = {
    title: parsed.stem,
    option_a: parsed.options[0],
    option_b: parsed.options[1],
    option_c: parsed.options[2],
    option_d: parsed.options[3],
    option_e: parsed.options[4],
    answer1: answer,
  };
  return {
    id: digest(`aops-${COMPETITION.key}:${contest}:${problemNumber}`, "md5"),
    type: "单选题",
    grade_band: COMPETITION.level,
    difficulty: sourceDifficulty(problemNumber),
    grade: COMPETITION.level,
    course: "数学",
    paper: `${displayContest(contest)} · Problem ${problemNumber}`,
    online_test: true,
    option_split: true,
    quality: "精品",
    question_info: { raw_content: rawContent },
    answer_info: { raw_content: answer },
    solution_info: parsed.solutions.map((solution) => ({ solution_info: solution })),
    children: [],
  } satisfies SourceQuestion;
}

function questionFingerprint(question: SourceQuestion) {
  const raw = question.question_info.raw_content;
  return digest(normalizedFingerprint([
    raw.title,
    raw.option_a,
    raw.option_b,
    raw.option_c,
    raw.option_d,
    raw.option_e,
  ].join("\n")));
}

function mergeDuplicateQuestions(scraped: ScrapedQuestion[]) {
  const byFingerprint = new Map<string, SourceQuestion>();
  const duplicateOccurrences: Array<{ canonical: string; duplicate: string }> = [];
  for (const item of scraped) {
    const fingerprint = questionFingerprint(item.question);
    const existing = byFingerprint.get(fingerprint);
    if (!existing) {
      byFingerprint.set(fingerprint, item.question);
      continue;
    }
    duplicateOccurrences.push({ canonical: existing.paper, duplicate: item.question.paper });
    existing.paper = [...new Set(`${existing.paper} | ${item.question.paper}`.split(" | "))].join(" | ");
    const solutionFingerprints = new Set(existing.solution_info.map((part) => digest(normalizedFingerprint(part.solution_info))));
    for (const solution of item.question.solution_info) {
      const solutionFingerprint = digest(normalizedFingerprint(solution.solution_info));
      if (!solutionFingerprints.has(solutionFingerprint)) {
        existing.solution_info.push(solution);
        solutionFingerprints.add(solutionFingerprint);
      }
    }
  }
  return { questions: [...byFingerprint.values()], duplicateOccurrences };
}

async function scrapeContest(contest: string, options: CliOptions) {
  const answerUrl = `${AOPS_ORIGIN}/wiki/index.php?title=${contest}_Answer_Key`;
  let answers = await cachedPoshenLohAnswerKey(contest, options);
  if (answers) {
    console.log(`${displayContest(contest)}: using cached Po-Shen Loh answer key fallback`);
  } else if (COMPETITION.key === "amc8") {
    answers = await poshenLohAnswerKey(contest, options).catch(() => null);
    if (answers) {
      console.log(`${displayContest(contest)}: using Po-Shen Loh answer key fallback`);
    } else {
      answers = parseAnswerKey(await archivedPage(answerUrl, `${contest}-answers`, options));
    }
  } else {
    try {
      answers = parseAnswerKey(await archivedPage(answerUrl, `${contest}-answers`, options, false));
    } catch {
      answers = await poshenLohAnswerKey(contest, options).catch(() => null);
      if (answers) {
        console.log(`${displayContest(contest)}: using Po-Shen Loh answer key fallback`);
      } else {
        answers = parseAnswerKey(await archivedPage(answerUrl, `${contest}-answers`, options));
      }
    }
  }
  let completed = 0;
  const problemNumbers = Array.from({ length: 25 }, (_, index) => index + 1);
  const results = await mapConcurrent(problemNumbers, 6, async (problemNumber) => {
    let sourceUrl = `${AOPS_ORIGIN}/wiki/index.php?title=${contest}_Problems/Problem_${problemNumber}`;
    let parsed: ReturnType<typeof parseProblemPage>;
    const cachedFallback = await cachedRandomMathProblem(contest, problemNumber, options);
    if (cachedFallback) {
      sourceUrl = cachedFallback.sourceUrl;
      parsed = parseRandomMathProblem(cachedFallback.html);
      console.log(`${displayContest(contest)} problem ${problemNumber}: using cached Random Math fallback`);
    } else {
      const fallback = await cachedPoshenLohProblem(contest, problemNumber, options);
      if (fallback) {
        sourceUrl = fallback.sourceUrl;
        parsed = parsePoshenLohProblem(fallback.html);
        console.log(`${displayContest(contest)} problem ${problemNumber}: using cached Po-Shen Loh fallback`);
      } else {
        const preferRandomMath = COMPETITION.key === "amc8"
          || (COMPETITION.key === "amc12" && !/(?:Fall|AMC_12P)/.test(contest));
        const preferredRandomMath = preferRandomMath
          ? await randomMathProblem(contest, problemNumber, options).catch(() => null)
          : null;
        if (preferredRandomMath) {
          sourceUrl = preferredRandomMath.sourceUrl;
          parsed = parseRandomMathProblem(preferredRandomMath.html);
          console.log(`${displayContest(contest)} problem ${problemNumber}: using Random Math source`);
        } else {
          try {
            const html = await archivedPage(sourceUrl, `${contest}-problem-${problemNumber}`, options, false);
            parsed = parseProblemPage(html);
          } catch {
            const randomMathFallback = preferRandomMath
              ? null
              : await randomMathProblem(contest, problemNumber, options).catch(() => null);
            if (randomMathFallback) {
              sourceUrl = randomMathFallback.sourceUrl;
              parsed = parseRandomMathProblem(randomMathFallback.html);
              console.log(`${displayContest(contest)} problem ${problemNumber}: using Random Math fallback`);
            } else {
              const secondaryFallback = await poshenLohProblem(contest, problemNumber, options).catch(() => null);
              if (secondaryFallback) {
                sourceUrl = secondaryFallback.sourceUrl;
                parsed = parsePoshenLohProblem(secondaryFallback.html);
                console.log(`${displayContest(contest)} problem ${problemNumber}: using Po-Shen Loh fallback`);
              } else {
                const html = await archivedPage(sourceUrl, `${contest}-problem-${problemNumber}`, options);
                parsed = parseProblemPage(html);
              }
            }
          }
        }
      }
    }
    const result = {
      contest,
      problemNumber,
      sourceUrl,
      question: makeQuestion(contest, problemNumber, answers[problemNumber - 1], parsed),
    } satisfies ScrapedQuestion;
    completed += 1;
    console.log(`${displayContest(contest)}: ${completed}/25`);
    return result;
  });
  return results;
}

async function main() {
  const options = parseCli();
  await mkdir(CACHE_DIRECTORY, { recursive: true });
  const index = await archivedPage(INDEX_URL, "index", options);
  const indexed = parseContests(index);
  const discovered = indexed.filter((contest) => contestIsAvailable(contest));
  if (!discovered.length) throw new Error(`No available AMC ${COMPETITION.number} contests discovered from the index`);
  const contests = options.contest ? discovered.filter((contest) => contest === options.contest) : discovered;
  if (!contests.length) throw new Error(`Contest not present in index: ${options.contest}`);
  console.log(`Discovered ${indexed.length} indexed contests; scraping ${contests.length} available contests.`);

  const outcomes = await mapConcurrent(contests, 4, async (contest) => {
    try {
      return { contest, questions: await scrapeContest(contest, options), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${displayContest(contest)} failed: ${message}`);
      return { contest, questions: [] as ScrapedQuestion[], error: message };
    }
  });
  const scraped = outcomes.flatMap((outcome) => outcome.questions);
  const failures = outcomes.filter((outcome) => outcome.error).map((outcome) => ({
    contest: outcome.contest,
    error: outcome.error ?? "Unknown error",
  }));
  if (failures.length) {
    throw new Error(`${failures.length} contests incomplete:\n${failures.map((item) => `- ${item.contest}: ${item.error}`).join("\n")}`);
  }

  const expectedSlots = contests.length * 25;
  if (scraped.length !== expectedSlots) throw new Error(`Expected ${expectedSlots} contest slots, scraped ${scraped.length}`);
  const { questions, duplicateOccurrences } = mergeDuplicateQuestions(scraped);
  const duplicateIds = questions.length - new Set(questions.map((question) => question.id)).size;
  const duplicateFingerprints = questions.length - new Set(questions.map(questionFingerprint)).size;
  const duplicateSolutionCount = questions.reduce((total, question) => {
    const fingerprints = question.solution_info.map((part) => digest(normalizedFingerprint(part.solution_info)));
    return total + fingerprints.length - new Set(fingerprints).size;
  }, 0);
  const invalid = questions.flatMap((question) => {
    const raw = question.question_info.raw_content;
    const fields = {
      title: raw.title,
      ...Object.fromEntries(["A", "B", "C", "D", "E"].map((letter) => [
        `option_${letter.toLowerCase()}`,
        raw[`option_${letter.toLowerCase()}`],
      ])),
      ...Object.fromEntries(question.solution_info.map((item, index) => [`solution_${index + 1}`, item.solution_info])),
    };
    const issues = Object.entries(fields).flatMap(([field, value]) => {
      if (!value) return [`${field}: missing`];
      return hasTextIntegrityIssue(value) ? [`${field}: ${textIntegritySummary(value)}`] : [];
    });
    if (!raw.answer1 || !/^[A-E]$/.test(raw.answer1)) issues.push("answer1: missing or invalid");
    if (!question.solution_info.length) issues.push("solutions: missing");
    return issues.length ? [{ paper: question.paper, issues }] : [];
  });
  if (duplicateIds || duplicateFingerprints || duplicateSolutionCount || invalid.length) {
    throw new Error(JSON.stringify({ duplicateIds, duplicateFingerprints, duplicateSolutionCount, invalid }, null, 2));
  }

  const report = {
    contests: contests.length,
    contestSlots: expectedSlots,
    uniqueQuestions: questions.length,
    duplicateQuestionOccurrencesMerged: duplicateOccurrences.length,
    solutions: questions.reduce((total, question) => total + question.solution_info.length, 0),
    duplicateSolutions: duplicateSolutionCount,
    output: options.dryRun || options.contest ? null : path.relative(process.cwd(), OUTPUT_FILE),
  };
  if (!options.dryRun && !options.contest) {
    const temporary = `${OUTPUT_FILE}.tmp`;
    await writeFile(temporary, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
    await rename(temporary, OUTPUT_FILE);
  }
  console.log(JSON.stringify(report, null, 2));
  if (duplicateOccurrences.length) console.log("Merged duplicate occurrences:", duplicateOccurrences);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
