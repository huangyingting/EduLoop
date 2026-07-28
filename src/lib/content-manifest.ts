import { z } from "zod";
import rawManifest from "../../data/catalog.json";

const filenameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*\.json$/);
const localeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
const localeEntrySchema = z.object({
  purpose: z.enum(["runtime", "source"]),
  files: z.array(filenameSchema).min(1),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  defaultLocale: localeSchema,
  locales: z.record(localeSchema, localeEntrySchema),
  collections: z.record(z.string().min(1), z.object({
    files: z.array(filenameSchema).min(1),
    sourceLocale: localeSchema,
    translatedLocales: z.array(localeSchema).min(1),
  })),
}).superRefine((manifest, context) => {
  const runtime = manifest.locales[manifest.defaultLocale];
  if (!runtime || runtime.purpose !== "runtime") {
    context.addIssue({ code: "custom", message: "defaultLocale must reference a runtime locale", path: ["defaultLocale"] });
  }
  for (const [locale, entry] of Object.entries(manifest.locales)) {
    if (new Set(entry.files).size !== entry.files.length) {
      context.addIssue({ code: "custom", message: "locale files must be unique", path: ["locales", locale, "files"] });
    }
  }
  for (const [name, collection] of Object.entries(manifest.collections)) {
    const locales = [collection.sourceLocale, ...collection.translatedLocales];
    for (const locale of locales) {
      const entry = manifest.locales[locale];
      if (!entry) {
        context.addIssue({ code: "custom", message: `unknown locale ${locale}`, path: ["collections", name] });
        continue;
      }
      for (const file of collection.files) {
        if (!entry.files.includes(file)) {
          context.addIssue({ code: "custom", message: `${file} is not declared for ${locale}`, path: ["collections", name, "files"] });
        }
      }
    }
  }
});

export const CONTENT_MANIFEST = manifestSchema.parse(rawManifest);
export const DEFAULT_CONTENT_LOCALE = CONTENT_MANIFEST.defaultLocale;

export function contentFilesForLocale(locale: string) {
  const entry = CONTENT_MANIFEST.locales[locale];
  if (!entry) throw new Error(`Unknown content locale: ${locale}`);
  return entry.files;
}

export function contentCollection(name: string) {
  const collection = CONTENT_MANIFEST.collections[name];
  if (!collection) throw new Error(`Unknown content collection: ${name}`);
  return collection;
}
