import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { z } from "zod";

const ROOT = process.cwd();
const errors = [];
const parsedFiles = new Map();

const stringRecordSchema = z.record(z.string(), z.string());
const filenameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*\.json$/);
const localeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
const hex32Schema = z.string().regex(/^[a-f0-9]{32}$/);
const hex64Schema = z.string().regex(/^[a-f0-9]{64}$/);

const rawQuestionContentSchema = z.object({
  title: z.string(),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
  option_e: z.string(),
  answer1: z.string(),
}).strict();

const childQuestionSchema = z.object({
  title: z.string(),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
  option_e: z.string().optional(),
  answer1: z.string(),
  order: z.number().int().positive(),
}).strict();

const questionSchema = z.object({
  id: hex32Schema,
  type: z.string().min(1),
  grade_band: z.enum(["小学", "初中", "高中", "AMC-8", "AMC-10", "AMC-12"]),
  difficulty: z.enum(["容易", "一般", "困难"]),
  grade: z.enum([
    "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
    "七年级", "八年级", "九年级", "初中综合", "高一", "高二", "高三",
    "AMC-8", "AMC-10", "AMC-12",
  ]),
  course: z.enum(["数学", "物理", "化学", "生物", "语文"]),
  paper: z.string(),
  online_test: z.boolean(),
  option_split: z.boolean(),
  quality: z.string().min(1),
  question_info: z.object({ raw_content: rawQuestionContentSchema }).strict(),
  answer_info: z.object({ raw_content: z.string() }).strict(),
  solution_info: z.array(z.object({ solution_info: z.string() }).strict()).min(1),
  children: z.array(childQuestionSchema),
  source_tags: z.array(z.object({
    dimension: z.enum(["TOPIC", "SKILL", "FORMAT"]),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().min(1),
    confidence: z.number().min(0).max(1),
    source: z.enum(["RULE", "IMPORT"]),
  }).strict()).optional(),
}).strict();

const localeEntrySchema = z.object({
  purpose: z.enum(["runtime", "source"]),
  files: z.array(filenameSchema).min(1),
}).strict();

const collectionSchema = z.object({
  files: z.array(filenameSchema).min(1),
  sourceLocale: localeSchema,
  translatedLocales: z.array(localeSchema).min(1),
}).strict();

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  defaultLocale: localeSchema,
  locales: z.record(localeSchema, localeEntrySchema),
  collections: z.record(z.string().min(1), collectionSchema),
}).strict();

const assetSchema = z.object({
  path: z.string().regex(/^\/question-assets\/source\/amc\/[a-f0-9]{64}\.(?:gif|jpe?g|png|svg)$/),
  sha256: hex64Schema,
  bytes: z.number().int().positive(),
  contentType: z.enum(["image/gif", "image/jpeg", "image/png", "image/svg+xml"]),
}).strict();

const assetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.record(z.string().url(), assetSchema),
}).strict();

const mathApprovalsSchema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal("sha256"),
  approvedFieldCount: z.number().int().nonnegative(),
  digest: hex64Schema,
  description: z.string().min(1),
}).strict();

const packageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  private: z.boolean(),
  engines: stringRecordSchema,
  scripts: stringRecordSchema,
  dependencies: stringRecordSchema,
  devDependencies: stringRecordSchema,
}).passthrough();

const packageLockSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  lockfileVersion: z.literal(3),
  requires: z.literal(true),
  packages: z.record(z.string(), z.record(z.string(), z.unknown())),
}).strict();

const tsconfigSchema = z.object({
  compilerOptions: z.record(z.string(), z.unknown()),
  include: z.array(z.string()).min(1),
  exclude: z.array(z.string()),
}).strict();

function issuePath(pathParts) {
  return pathParts.reduce((result, part) => (
    typeof part === "number" ? `${result}[${part}]` : `${result}${result ? "." : ""}${part}`
  ), "");
}

function validate(filename, schema, value, context = filename) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const location = issuePath(issue.path);
    errors.push(`${context}${location ? `:${location}` : ""}: ${issue.message}`);
  }
  return null;
}

async function loadTrackedJson() {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.json"], {
    cwd: ROOT,
    encoding: "utf8",
  }).split("\0").filter(Boolean);

  for (const filename of tracked) {
    try {
      const source = (await readFile(path.join(ROOT, filename), "utf8")).replace(/^\uFEFF/, "");
      parsedFiles.set(filename, JSON.parse(source));
    } catch (error) {
      errors.push(`${filename}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return tracked;
}

function validateCatalog(catalog) {
  if (!catalog) return;
  const runtime = catalog.locales[catalog.defaultLocale];
  if (!runtime || runtime.purpose !== "runtime") {
    errors.push("data/catalog.json:defaultLocale must reference a runtime locale");
  }

  for (const [locale, entry] of Object.entries(catalog.locales)) {
    if (new Set(entry.files).size !== entry.files.length) {
      errors.push(`data/catalog.json:locales.${locale}.files contains duplicates`);
    }
  }

  for (const [name, collection] of Object.entries(catalog.collections)) {
    const locales = [collection.sourceLocale, ...collection.translatedLocales];
    if (new Set(locales).size !== locales.length) {
      errors.push(`data/catalog.json:collections.${name} repeats a locale`);
    }
    for (const locale of locales) {
      const entry = catalog.locales[locale];
      if (!entry) {
        errors.push(`data/catalog.json:collections.${name} references unknown locale ${locale}`);
        continue;
      }
      for (const filename of collection.files) {
        if (!entry.files.includes(filename)) {
          errors.push(`data/catalog.json:collections.${name}.${filename} is not declared for ${locale}`);
        }
      }
    }
  }
}

async function validateQuestionArchives(catalog) {
  if (!catalog) return { files: 0, questions: 0, children: 0 };
  let fileCount = 0;
  let questionCount = 0;
  let childCount = 0;
  const expectedCourse = {
    "biology.json": "生物",
    "chemistry.json": "化学",
    "mathematics.json": "数学",
    "physics.json": "物理",
    "chinese.json": "语文",
  };

  for (const [locale, entry] of Object.entries(catalog.locales)) {
    const directory = path.join(ROOT, "data", locale);
    let actualFiles = [];
    try {
      actualFiles = (await readdir(directory)).filter((filename) => filename.endsWith(".json")).sort();
    } catch (error) {
      errors.push(`data/${locale}: cannot read locale directory (${error instanceof Error ? error.message : String(error)})`);
    }
    const declaredFiles = [...entry.files].sort();
    if (!isDeepStrictEqual(actualFiles, declaredFiles)) {
      errors.push(`data/catalog.json: locale ${locale} declares [${declaredFiles.join(", ")}], found [${actualFiles.join(", ")}]`);
    }

    const localeIds = new Map();
    for (const filename of entry.files) {
      const filepath = `data/${locale}/${filename}`;
      const value = parsedFiles.get(filepath);
      if (!Array.isArray(value)) {
        if (value !== undefined) errors.push(`${filepath}: expected a top-level array`);
        continue;
      }
      fileCount += 1;
      for (let index = 0; index < value.length; index += 1) {
        const rawRecord = value[index];
        const id = rawRecord && typeof rawRecord === "object" && typeof rawRecord.id === "string"
          ? rawRecord.id
          : `index-${index}`;
        const question = validate(filepath, questionSchema, rawRecord, `${filepath}:${id}`);
        if (!question) continue;
        questionCount += 1;
        childCount += question.children.length;
        const previous = localeIds.get(question.id);
        if (previous) errors.push(`${filepath}:${question.id}: duplicate locale ID (also in ${previous})`);
        else localeIds.set(question.id, filepath);

        const amc = filename.match(/^amc(8|10|12)\.json$/);
        if (amc) {
          const grade = `AMC-${amc[1]}`;
          if (question.grade_band !== grade || question.grade !== grade || question.course !== "数学") {
            errors.push(`${filepath}:${question.id}: ${filename} requires grade_band=${grade}, grade=${grade}, course=数学`);
          }
        } else if (expectedCourse[filename] && question.course !== expectedCourse[filename]) {
          errors.push(`${filepath}:${question.id}: ${filename} requires course=${expectedCourse[filename]}`);
        }
      }
    }
  }
  return { files: fileCount, questions: questionCount, children: childCount };
}

async function validateAssetManifest(manifest) {
  if (!manifest) return { assets: 0, files: 0 };
  const contentTypeByExtension = {
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
  };
  const checkedFiles = new Map();

  for (const [sourceUrl, entry] of Object.entries(manifest.assets)) {
    let url;
    try {
      url = new URL(sourceUrl);
    } catch {
      errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: invalid source URL`);
      continue;
    }
    if (url.protocol !== "https:") {
      errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: source URL must use HTTPS`);
    }
    const basename = path.posix.basename(entry.path);
    const [pathDigest, extension] = basename.split(".");
    if (pathDigest !== entry.sha256) {
      errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: path digest differs from sha256`);
    }
    if (contentTypeByExtension[extension] !== entry.contentType) {
      errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: ${extension} does not match ${entry.contentType}`);
    }

    let actual = checkedFiles.get(entry.path);
    if (!actual) {
      const diskPath = path.join(ROOT, "public", entry.path.slice(1));
      try {
        const [details, content] = await Promise.all([stat(diskPath), readFile(diskPath)]);
        actual = {
          bytes: details.size,
          sha256: createHash("sha256").update(content).digest("hex"),
        };
        checkedFiles.set(entry.path, actual);
      } catch (error) {
        errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: cannot read ${entry.path} (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }
    }
    if (actual.bytes !== entry.bytes) {
      errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: expected ${entry.bytes} bytes, found ${actual.bytes}`);
    }
    if (actual.sha256 !== entry.sha256) {
      errors.push(`public/question-assets/source/amc/manifest.json:${sourceUrl}: file digest differs from sha256`);
    }
  }

  const directory = path.join(ROOT, "public/question-assets/source/amc");
  const actualAssets = (await readdir(directory)).filter((filename) => filename !== "manifest.json").sort();
  const declaredAssets = [...checkedFiles.keys()].map((entry) => path.posix.basename(entry)).sort();
  if (!isDeepStrictEqual(actualAssets, declaredAssets)) {
    const actualSet = new Set(actualAssets);
    const declaredSet = new Set(declaredAssets);
    const missing = declaredAssets.filter((filename) => !actualSet.has(filename));
    const undeclared = actualAssets.filter((filename) => !declaredSet.has(filename));
    errors.push(`public/question-assets/source/amc/manifest.json: asset membership differs (missing: ${missing.join(", ") || "none"}; undeclared: ${undeclared.join(", ") || "none"})`);
  }
  return { assets: Object.keys(manifest.assets).length, files: checkedFiles.size };
}

function validateConfigFiles() {
  const packageJson = validate("package.json", packageSchema, parsedFiles.get("package.json"));
  const packageLock = validate("package-lock.json", packageLockSchema, parsedFiles.get("package-lock.json"));
  validate("tsconfig.json", tsconfigSchema, parsedFiles.get("tsconfig.json"));
  if (!packageJson || !packageLock) return;

  const rootPackage = packageLock.packages[""];
  if (!rootPackage) {
    errors.push("package-lock.json:packages must contain the root package at the empty key");
    return;
  }
  for (const field of ["name", "version", "engines", "dependencies", "devDependencies"]) {
    if (!isDeepStrictEqual(rootPackage[field], packageJson[field])) {
      errors.push(`package-lock.json:packages[\"\"].${field} differs from package.json`);
    }
  }
}

const tracked = await loadTrackedJson();
const expectedSchemas = new Set([
  "data/catalog.json",
  "package-lock.json",
  "package.json",
  "public/question-assets/source/amc/manifest.json",
  "scripts/amc-translation-math-approvals.json",
  "tsconfig.json",
]);

const catalog = validate("data/catalog.json", catalogSchema, parsedFiles.get("data/catalog.json"));
validateCatalog(catalog);
if (catalog) {
  for (const [locale, entry] of Object.entries(catalog.locales)) {
    for (const filename of entry.files) expectedSchemas.add(`data/${locale}/${filename}`);
  }
}
for (const filename of tracked) {
  if (!expectedSchemas.has(filename)) errors.push(`${filename}: no schema validator is registered for this tracked JSON file`);
}
for (const filename of expectedSchemas) {
  if (!tracked.includes(filename)) errors.push(`${filename}: schema is registered but the JSON file is not tracked`);
}

const questions = await validateQuestionArchives(catalog);
const assetManifest = validate(
  "public/question-assets/source/amc/manifest.json",
  assetManifestSchema,
  parsedFiles.get("public/question-assets/source/amc/manifest.json"),
);
const assets = await validateAssetManifest(assetManifest);
validate(
  "scripts/amc-translation-math-approvals.json",
  mathApprovalsSchema,
  parsedFiles.get("scripts/amc-translation-math-approvals.json"),
);
validateConfigFiles();

const report = {
  trackedJsonFiles: tracked.length,
  questionArchives: questions.files,
  questions: questions.questions,
  childQuestions: questions.children,
  assetProvenanceEntries: assets.assets,
  uniqueAssetFiles: assets.files,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
