import { DEFAULT_LOCALE, type Locale } from "../config";
import { createTranslator, type MessageKey, type TranslatorFor } from "../translate";
import { en } from "./en";
import { zhCN, type Messages } from "./zh-CN";

export type { Messages };
export type Key = MessageKey<Messages>;
export type Translator = TranslatorFor<Messages>;
export type ErrorMessageKey = keyof Messages["errors"];

export const catalogs: Record<Locale, Messages> = { "zh-CN": zhCN, en };

export function translatorFor(locale: Locale): Translator {
  return createTranslator(catalogs[locale], catalogs[DEFAULT_LOCALE]);
}

export function isErrorMessageKey(value: unknown): value is ErrorMessageKey {
  return typeof value === "string" && Object.hasOwn(zhCN.errors, value);
}

// For keys built from data (badge slugs, enum values): falls back to the
// stored text when the catalog has no entry for it.
export function translateOr(t: Translator, key: string, fallback: string) {
  const text = t(key as Key);
  return text === key ? fallback : text;
}
