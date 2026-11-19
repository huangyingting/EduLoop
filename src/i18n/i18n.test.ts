import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, localeFromCookieHeader, resolveLocale } from "./config";
import { fatalErrorText } from "./fatal-error";
import { catalogs, isErrorMessageKey, translateOr, translatorFor } from "./messages";
import { createTranslator, formatMessage, lookupMessage } from "./translate";

function leaves(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

function placeholders(template: string) {
  return [...new Set([...template.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map(([, name]) => name))].sort();
}

describe("locale selection", () => {
  it("defaults to Simplified Chinese unless the cookie names a supported locale", () => {
    expect(DEFAULT_LOCALE).toBe("zh-CN");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("fr")).toBe("zh-CN");
    expect(resolveLocale(undefined)).toBe("zh-CN");
    expect(localeFromCookieHeader("a=1; eduloop-locale=en; b=2")).toBe("en");
    expect(localeFromCookieHeader("eduloop-locale=xx")).toBe("zh-CN");
    expect(localeFromCookieHeader(null)).toBe("zh-CN");
  });

  it("localizes the fatal error boundary from the cookie alone", () => {
    expect(fatalErrorText("eduloop-locale=en")).toMatchObject({ locale: "en", reload: "Reload" });
    expect(fatalErrorText("")).toMatchObject({ locale: "zh-CN", reload: "重新加载" });
  });
});

describe("message formatting", () => {
  it("fills parameters and picks plural words by count", () => {
    expect(formatMessage("{count} {count|question|questions} left", { count: 1 })).toBe("1 question left");
    expect(formatMessage("{count} {count|question|questions} left", { count: 3 })).toBe("3 questions left");
    expect(formatMessage("Hello {name}", {})).toBe("Hello {name}");
    expect(formatMessage("Plain")).toBe("Plain");
  });

  it("falls back to the default catalog, then to the key", () => {
    const t = createTranslator({ greeting: "Hi" }, { greeting: "你好", farewell: "再见" });
    expect(t("greeting" as never)).toBe("Hi");
    expect(t("farewell" as never)).toBe("再见");
    expect(t("missing" as never)).toBe("missing");
    expect(lookupMessage({ a: { b: "c" } }, "a.b")).toBe("c");
    expect(lookupMessage({ a: { b: "c" } }, "a")).toBeNull();
  });

  it("uses stored text for data-driven keys the catalog does not know", () => {
    const t = translatorFor("en");
    expect(translateOr(t, "badges.first-spark.name", "第一束光")).toBe("First Spark");
    expect(translateOr(t, "badges.custom-badge.name", "Custom")).toBe("Custom");
  });
});

describe("catalogs", () => {
  const source = new Map(leaves(catalogs["zh-CN"]));

  it("translate every key with the same placeholders", () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const entries = new Map(leaves(catalog));
      expect([...entries.keys()].sort(), locale).toEqual([...source.keys()].sort());
      for (const [key, template] of entries) {
        expect(template.trim(), `${locale}:${key}`).not.toBe("");
        expect(placeholders(template), `${locale}:${key}`).toEqual(placeholders(source.get(key)!));
      }
    }
  });

  it("recognize only catalog error keys from API responses", () => {
    expect(isErrorMessageKey("signInRequired")).toBe(true);
    expect(isErrorMessageKey("toString")).toBe(false);
    expect(isErrorMessageKey(42)).toBe(false);
  });
});
