import { describe, expect, it } from "vitest";
import { CONTENT_MANIFEST, DEFAULT_CONTENT_LOCALE, contentCollection, contentFilesForLocale } from "./content-manifest";

describe("content manifest", () => {
  it("declares a complete default runtime catalog", () => {
    expect(DEFAULT_CONTENT_LOCALE).toBe("zh-CN");
    expect(CONTENT_MANIFEST.locales[DEFAULT_CONTENT_LOCALE].purpose).toBe("runtime");
    expect(contentFilesForLocale(DEFAULT_CONTENT_LOCALE)).toHaveLength(8);
  });

  it("keeps collection files aligned across source and translated locales", () => {
    const collection = contentCollection("amc");
    expect(collection.files).toEqual(["amc8.json", "amc10.json", "amc12.json"]);
    for (const locale of [collection.sourceLocale, ...collection.translatedLocales]) {
      expect(contentFilesForLocale(locale)).toEqual(expect.arrayContaining(collection.files));
    }
  });
});
