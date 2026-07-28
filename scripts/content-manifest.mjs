import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DATA_ROOT = path.resolve(process.cwd(), "data");
const manifest = JSON.parse(await readFile(path.join(DATA_ROOT, "catalog.json"), "utf8"));

function fail(message) {
  throw new Error(`Invalid data/catalog.json: ${message}`);
}

if (manifest.schemaVersion !== 1) fail("unsupported schemaVersion");
if (!manifest.locales?.[manifest.defaultLocale] || manifest.locales[manifest.defaultLocale].purpose !== "runtime") {
  fail("defaultLocale must reference a runtime locale");
}
for (const [locale, entry] of Object.entries(manifest.locales)) {
  if (!Array.isArray(entry.files) || !entry.files.length || entry.files.some((file) => !/^[a-z0-9][a-z0-9-]*\.json$/.test(file))) {
    fail(`${locale} must declare valid JSON filenames`);
  }
  if (new Set(entry.files).size !== entry.files.length) fail(`${locale} contains duplicate filenames`);
  const actual = (await readdir(path.join(DATA_ROOT, locale))).filter((file) => file.endsWith(".json")).sort();
  const declared = [...entry.files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    fail(`${locale} files differ; declared ${declared.join(", ")}, found ${actual.join(", ")}`);
  }
}
for (const [name, collection] of Object.entries(manifest.collections ?? {})) {
  if (!Array.isArray(collection.files) || !collection.files.length) fail(`${name} must declare files`);
  for (const locale of [collection.sourceLocale, ...(collection.translatedLocales ?? [])]) {
    const declared = manifest.locales[locale]?.files;
    if (!declared) fail(`${name} references unknown locale ${locale}`);
    for (const file of collection.files) if (!declared.includes(file)) fail(`${name}/${file} is not declared for ${locale}`);
  }
}

export const DEFAULT_CONTENT_LOCALE = manifest.defaultLocale;
export const DEFAULT_CONTENT_FILES = Object.freeze([...manifest.locales[DEFAULT_CONTENT_LOCALE].files]);

export function localeDirectory(locale) {
  if (!manifest.locales[locale]) fail(`unknown locale ${locale}`);
  return path.join(DATA_ROOT, locale);
}

export function localeFileUrl(locale, filename) {
  if (!manifest.locales[locale]?.files.includes(filename)) fail(`${filename} is not declared for ${locale}`);
  return pathToFileURL(path.join(localeDirectory(locale), filename));
}

export function collection(name) {
  const value = manifest.collections?.[name];
  if (!value) fail(`unknown collection ${name}`);
  return Object.freeze({
    files: Object.freeze([...value.files]),
    sourceLocale: value.sourceLocale,
    translatedLocales: Object.freeze([...value.translatedLocales]),
  });
}
